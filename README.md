# EventStencil

![EventStencil: make payload changes visible](https://vendorwindow.hatchable.site/eventstencil-social.jpg)

**Turn webhook examples into portable fixture regression tests.**

[Try the free workbench](https://vendorwindow.hatchable.site/launch.html?utm_source=github&utm_medium=repository&utm_campaign=launch) · [Read the guide](https://vendorwindow.hatchable.site/webhook-fixture-testing.html?utm_source=github&utm_medium=repository&utm_campaign=launch) · [Offline app + source](https://vendorwindow.hatchable.site/purchase.html?utm_source=github&utm_medium=repository&utm_campaign=launch)

EventStencil compares a baseline JSON example with a candidate, highlights missing fields and changed types, and exports runnable fixture checks for Node and GitHub Actions.

This repository is a **public showcase and fictional generated example**. It is not the paid EventStencil application source.

## Try the example

Download the [free fictional example kit](https://vendorwindow.hatchable.site/examples/eventstencil-example-kit.zip), extract it, and run:

```sh
npm test
```

Requires Node 22 or later. Generated kits need no dependency installation. The current fictional candidate is compatible and passes. Change `repository.private` from a boolean to a string in the candidate fixture to see the check fail.

## What the workbench does

- Compare missing fields, observed types and added fields.
- Ignore exact or wildcard JSON Pointer paths, such as `/delivery_id` or `/items/*/id`.
- Review rule-based, type-preserving redaction before sharing fixtures.
- Save cases in your browser and export editable project backups.
- Export fixtures, a comparison runtime, sample-derived JSON Schema, Node tests and a GitHub Actions workflow.

Payload processing happens in your browser. Saved cases stay on that device unless you export them. Exported project backups may contain original sensitive values; review what you share.

## What it does not do

The tool checks supplied fixture shapes. It does not receive live webhooks, verify signatures, invoke your handler or infer a provider's complete contract. Baseline fields are required; nulls, optional fields and array variants need deliberate review. Redaction cannot discover every secret embedded in text.

## Free demo and paid download

Every hosted workbench feature is free to try. The optional **USD 39 one-time offline edition** includes the downloadable app, editable source and a license for personal or internal commercial use. No subscription, cloud sync, standalone redistribution rights or guaranteed future updates are included.

## Feedback and support

Use [the support form](https://vendorwindow.hatchable.site/support.html). Useful feedback includes the type of fixture difference you wanted to review and which rule was unclear. Do not post credentials or production payloads in public issues.

EventStencil 0.1 is beta software. The product and these materials were prepared with AI assistance. The included generated example was executed successfully with Node's test runner.
