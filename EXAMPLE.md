# EventStencil fixture test kit

This kit checks the JSON files in this folder against explicit expectations inferred from their baseline examples. It uses Node's built-in test runner with no npm dependencies.

## Run it

1. Install Node.js 22 or later.
2. Open a terminal in this folder and run:

```sh
npm test
```

No npm install is required. The runtime and fixtures are ordinary local files. The test runner does not contact any endpoint, execute payload code, or import a user-provided handler.

## Make this a useful regression check

There are 1 case(s). Each has separate files under fixtures/:

- **.baseline.json**: the reference observed event. Review changes intentionally.
- **.candidate.json**: the new event to check. Replace it with your next test event, then run npm test again.
- **.contract.json**: the baseline's observed-shape snapshot. It is not a complete provider specification.

Cases and options are listed in cases.json. Change ignorePaths, compareValues or allowExtra there if your expectations change. A slash path such as /data/id is a JSON Pointer; ~1 means a slash in a key, ~0 means a tilde. A whole * path segment is a wildcard. Ignoring a path also ignores its subtree, including type and missing-field checks. Use ignore rules carefully.

The current candidate files are the ones selected in the app; if they already differ, the exported tests may fail immediately. That is intentional. To see the check work, change the type of a non-ignored required field in a candidate, or remove that field, and run npm test. Restore it afterwards. Do not replace both baseline and candidate with the same new event just to make a failure disappear.

## What passes or fails

Missing expected fields and changed expected types fail the test. Extra fields follow allowExtra. Value differences follow compareValues. The bundled runtime is authoritative for array and path behavior. Warnings appear as test diagnostics and do not fail CI; errors fail CI. See the app's comparison results before exporting.

An observed baseline cannot prove which fields a provider considers optional or enumerate every valid event variant. A clean result only means the selected candidate satisfies these selected observed expectations. It does not prove the webhook was delivered, authenticated, processed correctly, or that an application's handler works. Live-provider changes are not fetched automatically. Add a handler test in your own codebase separately.

## Privacy and redaction

Redaction was enabled. 0 matching field occurrence(s) were replaced across baseline and candidate payloads. Primitive types and object/array structure are preserved.

Automated redaction is limited to configured/default keys and selected paths. Review every exported fixture and the project file before sharing or committing. Field names themselves can also be sensitive. A saved export is not encrypted, and redaction is not a guarantee that all personal information or secrets were found.

The file eventstencil-project.json is a portable project copy. Its payloads use the same redacted data as these fixtures. The report below contains paths and classifications, not payload values. Do not reuse an original provider signature with modified or reserialized fixture data.

## GitHub Actions

The included .github/workflows/payload-check.yml checks these files on pushes, pull requests and manual runs. Put the whole kit at a repository root, or adapt paths and the working directory to fit your repository. The workflow gives the GitHub token contents: read only. It downloads the standard checkout and Node setup actions; the fixture tests themselves make no network requests. GitHub runner limits or charges depend on your account and repository.

## Files and maintenance

Keep runtime.mjs, cases.json, fixtures/ and tests/ together. No application account is needed to run the exported checks. Exported checks are editable source; the baseline .contract.json file should be updated only after a deliberate review of changed expectations. The kit contains no checkout, licensing service or payment activation.

## Export notes

- These checks validate selected JSON fixtures against observed baseline expectations; they do not test a real handler or monitor live providers.
- Review all exported files: automatic redaction can miss sensitive content.
- Ignored paths are excluded with their whole subtree, including shape/type checks. Review ignore rules before relying on a pass.
