import { readFileSync } from "node:fs"
import path from "node:path"
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib"
import type { StackProps } from "aws-cdk-lib"
import * as acm from "aws-cdk-lib/aws-certificatemanager"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront"
import * as origins from "aws-cdk-lib/aws-cloudfront-origins"
import * as route53 from "aws-cdk-lib/aws-route53"
import * as targets from "aws-cdk-lib/aws-route53-targets"
import * as s3 from "aws-cdk-lib/aws-s3"
import type { Construct } from "constructs"

export const DOMAIN = "tradecn.dev"

// The registrar created this zone with the domain. Naming it here instead of looking it up means
// `cdk synth` runs without credentials and no account id is written into the repo.
export const HOSTED_ZONE_ID = "Z08196132ZI9KWD707HU7"

// Fixed names, so the deploy role in github-oidc-role.yml can be scoped to this bucket and nothing
// else in the account. No dots: a dotted bucket name breaks TLS between CloudFront and S3.
export const SITE_BUCKET = "tradecn-dev-site"
export const LOGS_BUCKET = "tradecn-dev-logs"

// The security headers every response carries, shared with scripts/site/smoke.ts, which serves them
// locally: a page this policy would break fails the smoke before it is published. The first
// previews shipped against a policy written for a page with no script, and only the live check saw it.
export const SITE_HEADERS = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../site/headers.json"), "utf8")) as {
  "content-security-policy": string
  "x-frame-options": "DENY" | "SAMEORIGIN"
}

/**
 * tradecn.dev: one private bucket behind CloudFront. The landing page lives at the root and the
 * shadcn registry under /r: /r/{name}.json is the latest release and /r/vX.Y.Z/{name}.json is that
 * release for as long as the domain exists. The release job in .github/workflows/release-please.yml
 * writes the objects; this stack never touches content.
 */
export class TradecnSiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: DOMAIN,
    })

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: DOMAIN,
      subjectAlternativeNames: [`www.${DOMAIN}`],
      validation: acm.CertificateValidation.fromDns(zone),
    })

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: SITE_BUCKET,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      // S3 answers the preflight for /r; the response headers policy below adds the headers on the
      // way out.
      cors: [{ allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD], allowedOrigins: ["*"], allowedHeaders: ["*"] }],
    })

    // CloudFront writes standard logs through ACLs, so this bucket keeps them enabled.
    const logsBucket = new s3.Bucket(this, "LogsBucket", {
      bucketName: LOGS_BUCKET,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(90), abortIncompleteMultipartUploadAfter: Duration.days(7) }],
    })

    const siteHeaders = new cloudfront.ResponseHeadersPolicy(this, "SiteHeaders", {
      responseHeadersPolicyName: "tradecn-dev-site",
      comment: "Security headers for the tradecn.dev pages and previews",
      securityHeadersBehavior: {
        // From site/headers.json: scripts and frames are 'self' (the pages' /site.js, the
        // /preview/ bundle, the preview iframes); styles allow inline for the pages' palette blocks.
        contentSecurityPolicy: { contentSecurityPolicy: SITE_HEADERS["content-security-policy"], override: true },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: SITE_HEADERS["x-frame-options"] === "DENY" ? cloudfront.HeadersFrameOption.DENY : cloudfront.HeadersFrameOption.SAMEORIGIN,
          override: true,
        },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=()", override: true }],
      },
    })

    // Browser-side registry viewers and MCP clients fetch item JSON cross-origin. The CLI runs in
    // Node and never sends an Origin header, so this costs it nothing.
    const registryHeaders = new cloudfront.ResponseHeadersPolicy(this, "RegistryHeaders", {
      responseHeadersPolicyName: "tradecn-dev-registry",
      comment: "CORS for the shadcn registry under /r",
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ["*"],
        accessControlAllowMethods: ["GET", "HEAD"],
        accessControlAllowOrigins: ["*"],
        accessControlMaxAge: Duration.days(1),
        originOverride: true,
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
      },
    })

    // www redirects to the apex so the registry has one spelling. S3 through OAC does not resolve
    // directory indexes, so a route without an extension gets its index.html.
    const viewerRequest = new cloudfront.Function(this, "ViewerRequest", {
      functionName: "tradecn-dev-viewer-request",
      comment: "www to apex redirect and index.html rewrite for tradecn.dev",
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : "";
  if (host === "www.${DOMAIN}") {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: "https://${DOMAIN}" + request.uri } },
    };
  }
  var uri = request.uri;
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.lastIndexOf(".") <= uri.lastIndexOf("/")) {
    request.uri = uri + "/index.html";
  }
  return request;
}`),
    })

    const origin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket)
    const functionAssociations = [{ function: viewerRequest, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }]

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `${DOMAIN}: landing page at the root, shadcn registry under /r`,
      defaultRootObject: "index.html",
      domainNames: [DOMAIN, `www.${DOMAIN}`],
      certificate,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: logsBucket,
      logFilePrefix: "cloudfront/",
      defaultBehavior: {
        origin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: siteHeaders,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations,
      },
      additionalBehaviors: {
        "/r/*": {
          origin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          // The objects carry their own Cache-Control: a year for /r/vX.Y.Z/, five minutes for the
          // latest pointers. This policy honors both.
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          responseHeadersPolicy: registryHeaders,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations,
        },
      },
      // S3 behind OAC answers 403 for a key that does not exist. A missing item has to be a 404 and
      // never a 200 with the landing page in it, or the CLI would try to parse HTML as an item.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: Duration.minutes(1) },
      ],
    })

    const alias = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
    for (const [name, recordName] of [
      ["Apex", DOMAIN],
      ["Www", `www.${DOMAIN}`],
    ] as const) {
      new route53.ARecord(this, `${name}A`, { zone, recordName, target: alias })
      new route53.AaaaRecord(this, `${name}Aaaa`, { zone, recordName, target: alias })
    }

    new CfnOutput(this, "SiteBucketName", {
      value: siteBucket.bucketName,
      description: "Bucket the release job writes the page and /r into",
    })
    new CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "Distribution the release job invalidates",
    })
    new CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
      description: "CloudFront hostname behind the aliases",
    })
    new CfnOutput(this, "LogsBucketName", {
      value: logsBucket.bucketName,
      description: "CloudFront standard logs, kept 90 days",
    })
    new CfnOutput(this, "SiteUrl", { value: `https://${DOMAIN}`, description: "Public URL" })
  }
}
