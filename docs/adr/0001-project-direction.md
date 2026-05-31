# ADR 0001: Start docs-first with a tablet web app

## Status

Proposed

## Context

We want to build an open-source family command center inspired by dedicated family calendar appliances. The first available hardware target is a Fire HD 10 tablet.

## Decision

Start with a docs-first repository and build a browser-based web app optimized for 10-inch tablet landscape mode.

## Consequences

Positive:

- Fastest path to a visible prototype
- Works on many devices
- Avoids native app development at the start
- Easier for contributors to run locally

Negative:

- Kiosk behavior depends on device/browser capabilities
- Native integrations may be limited initially
- Fire OS may require workarounds
