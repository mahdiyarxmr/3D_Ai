# File formats

| Purpose         | Format               | Location                                  |
| --------------- | -------------------- | ----------------------------------------- |
| Character model | `.vrm` (GLB + VRM ext) | `storage/characters/<id>/character.vrm`  |
| Character record| SQLite row (JSON blob) | `hermes.sqlite3`                        |
| Settings        | SQLite row (JSON blob) | `hermes.sqlite3`                        |
| Audit log       | SQLite table, append-only | `hermes.sqlite3`                     |
| Session secret  | JSON                 | `storage/settings/session.json`           |
| Locales         | JSON                 | `locales/<lang>/<namespace>.json`         |
| Voice profiles  | part of the character record | —                                 |

SQLite runs in WAL mode so the audit log survives a crash.

## Uploaded VRM files are untrusted data

They are never executed, and they are validated **before** the glTF parser is
handed the bytes (`packages/vrm/src/validate.ts`):

| Check                              | Rejection reason      |
| ---------------------------------- | --------------------- |
| File is at least a GLB header      | `too_small`           |
| Magic equals `glTF`                | `bad_magic`           |
| Container version is 2             | `bad_version`         |
| Declared length matches actual     | `length_mismatch`     |
| First chunk is `JSON`              | `missing_json_chunk`  |
| JSON chunk parses                  | `bad_json`            |
| `VRM` or `VRMC_vrm` extension present | `not_vrm`          |
| Size ≤ 200 MB                      | `too_large`           |

`validateVrm` returns a discriminated result and **never throws** — asserted by
a 40-seed fuzz test over arbitrary bytes, because a malformed model must
surface as a polite error message, not a white screen.

> **Regression, keep the test:** GLB pads the JSON chunk to a 4-byte boundary.
> The spec says pad with spaces; real exporters also use NUL. An early version
> passed the padding straight to `JSON.parse`, which rejected roughly three out
> of four real-world VRM files as `bad_json`. Padding is now stripped before
> parsing, and `tests/vrm.test.ts` covers every alignment case.

## Identifiers as path segments

A character `id` is a lowercase slug, and it is **re-sanitised in Rust** before
being used as a directory name — the renderer is not trusted to have validated
it. Traversal attempts are rejected rather than escaped.

## Logs

The audit log is a SQLite table rather than JSONL: it needs indexed queries by
tool and time for the audit screen, and append-only semantics that survive a
crash mid-write.
