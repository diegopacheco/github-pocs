# Release Guide

Everything a reviewer needs to check before a release.

![pipeline](assets/pipeline.svg)

## Checklist

- [x] Tests are green
- [x] Changelog updated
- [ ] Docs reviewed
  - README
  - API reference

## Environments

| Environment | Region | Replicas |
|:---|:---:|---:|
| staging | us-east-1 | 2 |
| production | us-east-1 | 6 |

## Rollout

1. Deploy to **staging**
2. Run the smoke suite with `make smoke`
3. Promote to *production*

```bash
./deploy.sh --env production --replicas 6
```

> Rollbacks use the previous image tag, never `latest`.

See the [status board](pages/status.html) for live checks.
