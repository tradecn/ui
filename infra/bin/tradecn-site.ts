#!/usr/bin/env bun
import { App } from "aws-cdk-lib"
import { TradecnSiteStack } from "../lib/tradecn-site-stack"

const app = new App()

new TradecnSiteStack(app, "TradecnSiteStack", {
  // A CloudFront certificate has to live in us-east-1, so the whole stack does. The account comes
  // from the credentials at deploy time; a synth without credentials works because nothing is
  // looked up.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "tradecn.dev: a private bucket behind CloudFront for the landing page and the shadcn registry",
})
