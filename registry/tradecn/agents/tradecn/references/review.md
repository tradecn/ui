# Review

The walk to finish UI work with, and the change order to write when someone else makes the fixes. Run it on test data, never on production data.

## The walk

1. **The check.** Run `checkContract` on every screen the change touched, in light, dark and hyperlegible mode. It should report no findings, and a `checked` count above zero for each rule the screen has content for.
2. **Screenshots.** Take one of each touched panel in each mode, at the smallest window size the app supports and at a typical desk size. Look at every one before going on.
3. **States.** Force each state and look at it: empty, loading or resyncing, stale, disconnected, pending, refused, and a burst of arrivals. A state the screen can't show is a finding.
4. **Keys.** Do every action from the keyboard. The Tab order follows the reading order, focus is always visible, Escape closes what it opened, and a dialog blocks the shortcuts behind it. Start a burst while typing in a ticket: the caret, the focus and the active row stay where they were.
5. **Numbers.** Numeric columns are right-aligned and in the instrument's notation, a unit is said once in the header, a change carries its sign, and a value cut short shows whole in its title or tooltip.
6. **Color.** Every colored value says its direction or state another way too. Look at the screen in grayscale. The theme matches the desk's up and down convention.
7. **Density.** No empty bands, no scrolling to reach a primary action, nothing clipped at the smallest size, and no decoration that isn't information.
8. **Speed.** Watch `perf-monitor` through a burst. The change adds no long frames, and nothing renders per tick outside the rows that changed.

## The change order

When the fixes go to someone who can't see what you saw, write them as a change order that stands on its own, since its reader may have nothing else. One finding per section, the most severe first:

```markdown
# Change order: <screen or topic>

Revision: <commit or tag reviewed>. Data: <the test data used>. Screens: <panels, modes and window sizes>.

## 1. <short title>

- **Where:** <file, component, part or selector>
- **Now:** <what it does, as observed>
- **Change:** <exactly what to do: the item or part, the prop, the token, the value>
- **Done when:** <the check, the test or the screenshot that proves it>

## Leave alone

<what this order doesn't cover, so the fixes stay in scope>
```

Name values exactly. Write `text-up` beside a `formatSigned` value, not "make it green".
