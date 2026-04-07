# fly-secrets-diff

An easy way to diff fly.io machine secrets with your local secrets. Fly's
secrets management is largely a manual process, sometimes features get
deprecated or services change, and some secrets linger around unused. Or you add
a new feature and it works fine locally but the health-check won't pass because
of a missing secret.

This package prints a nice looking diff with `console.table()`:

![CLI output](https://i.postimg.cc/BnmwR9sF/Screenshot-2025-09-29-at-13-57-53.png)

## Install

You need to have `flyctl` installed in your machine: `brew install flyctl`.

```sh
pnpm add fly-secrets-diff
```

Or just copy it over to you project, it's a single JavaScript file with no deps.

## Usage

```
  Diff your fly.io app secrets with your local .env file.

  Examples:
    Basic:
    $ fly-secrets-diff --env-file ./myApp/.env --app my-app
    Shorthand:
    $ fsd --env-file ./myApp/.env --app my-app

    Exclude env vars which are not secrets:
    $ fsd -a my-app -f NODE_ENV -f PORT -f TZ

    Or use the custom pattern matcher, it only uses star and does three things:
    $ fsd -a my-app -f LOCAL_*  # Prefix
    $ fsd -a my-app -f *_FOO    # Suffix
    $ fsd -a my-app -f *FOO*    # Contains

  Usage:
    fly-secrets-diff [flags]
    fsd [flags]

    Flags:

    -a, --app      : Name of your fly app
    -e, --env-file : Absolute or relative path to your .env file, default ./.env
    -f, --filter   : Multiple values of strings or a pattern: FOO_*, *_FOO, or
                     *FOO* of keys you want to exclude from the check
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
