# f-diff, fly.io secrets differ

An easy way to diff fly.io machine secrets with your local secrets.

[![Screenshot-2025-09-29-at-13-57-53.png](https://i.postimg.cc/BnmwR9sF/Screenshot-2025-09-29-at-13-57-53.png)](https://postimg.cc/tsV5VcsR)

## Install

```sh
pnpm add f-diff
```

## Usage

```
Diff your fly.io app secrets with your local .env file.

Examples:
  Basic:
  $ fdiff --env-file ./myApp/.env --app my-fly-app

  You might want to exclude some env vars that are not really secrets, those
  should be defined in fly.toml:
  $ sdiff --a my-fly-app --filter NODE_ENV --filter PORT --filter TZ

  Or filter out secrets that start with LOCAL_:
  $ sdiff --a my-fly-app --filter '^LOCAL_'

Usage:
  sdiff [flags]

  Flags:

  -a, --app      : Name of your fly app
  -e, --env-file : Absolute or relative path to your .env file, defaults to
                   ./.env
  -f, --filter   : Multiple values of strings or a regex pattern of keys you
                   want to exclude from the check
  -r, --reveal   : Should the secrets be logged into std out, normally they
                   are obfuscated
  -h, --help     : Show help
```

## Development

```sh
pnpm i
pnpm format
pnpm lint
pnpm test
pnpm build
pnpm ncu # Update packages
```
