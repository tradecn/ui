# tradecn-slate-east

Slate with the direction pair turned around, red for up and green for down, as screens in China, Japan, and Taiwan show it.

## Usage

A theme installs no files. It rewrites the variables in your stylesheet, so look first, and commit before you run it without `--diff`:

```bash
npx shadcn@latest add tradecn/ui/tradecn-slate-east --diff
```

## API Reference

Read [`tradecn-slate`](tradecn-slate.md) first: everything there about overwriting, the two sides, and how the colors are checked is true of this one too.

### What differs

Four tokens, in both modes, and nothing else: `up`, `down`, `up-soft`, and `down-soft`. There is a test that fails if the two themes ever differ anywhere else, so a fix to one palette cannot miss the other.

### Why it exists

In mainland China, Japan, and Taiwan a rising price is shown in red and a falling one in green, the reverse of the Western convention, and red carries good fortune rather than danger there; the effect red has on Western investors' expectations is muted in China for that reason ([Bazley, Cronqvist, and Mormann on red and investor behavior](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals)). A screen for that market should not make its readers translate. The pair is still Okabe and Ito's vermilion and bluish green, only assigned the other way, so it survives the same eyes and the same grayscale print, and direction still travels in the sign and the words, never in the hue alone.
