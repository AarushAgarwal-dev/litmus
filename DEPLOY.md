# Deploying Litmus

Litmus is a Next.js server: it needs a running Node process (streaming responses, filesystem, the Anthropic SDK), not a static host. Any container or Node platform works. This guide covers AWS App Runner (the recommended AWS option) and Render (the fastest option if you want it online in two minutes).

The audit store writes to `web/.audits` at runtime. On most hosts that disk is ephemeral (reset on redeploy), which is fine: the committed reports in `web/seed-audits/` are copied in on first request, so the example permalinks and the Recent-audits strip work on a fresh instance without re-running anything. For storage that survives redeploys, attach a persistent volume mounted at `web/.audits` or move the store to a database.

Set `ANTHROPIC_API_KEY` as a secret on whichever platform you choose. Without it the deterministic engine, the forensic checks, and the retrieval still run; with it you get the Claude claim extraction, adjudication, stance classification, and written summary.

## Option A: AWS App Runner with a container (recommended for AWS)

This is the reliable AWS path. The `web/Dockerfile` pins Node 22 and builds a small standalone server, so it does not depend on any managed runtime version. It has been validated by running the produced standalone server locally; the example permalinks serve correctly from the seed on an empty disk.

You need the AWS CLI configured (`aws configure`) and a working Docker engine.

```bash
# from the repo root
AWS_REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO=litmus

# 1. Create an ECR repository
aws ecr create-repository --repository-name $REPO --region $AWS_REGION >/dev/null 2>&1 || true

# 2. Build and push the image
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com
docker build -t $REPO ./web
docker tag $REPO:latest $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest
docker push $ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest
```

Then create the service. The simplest way is the App Runner console:

1. App Runner, Create service, Container registry, Amazon ECR, pick the image you pushed.
2. Deployment settings, give it an access role (the console can create one).
3. Service settings: port `3000`, health check path `/api/status`.
4. Add an environment variable `ANTHROPIC_API_KEY` (mark it a secret).
5. Create. App Runner gives you an HTTPS URL in a few minutes.

To redeploy later, push a new image tag and App Runner rolls it out.

If your Docker engine will not start locally, build the image in the cloud instead: point AWS CodeBuild or a GitHub Action at `web/Dockerfile`, push to ECR, then create the App Runner service from that image.

## Option B: AWS App Runner from source (no Docker)

App Runner can build straight from GitHub using `web/apprunner.yaml`, no Docker required. In the console: Create service, Source code, connect the GitHub repo, set the source directory to `web`, and let it use the configuration file. Add `ANTHROPIC_API_KEY` as a secret.

Caveat: App Runner's managed Node runtime can trail the version Next.js 16 expects. If the build fails on the Node version, use Option A (the container pins Node 22).

## Option C: AWS Lightsail containers (cheaper, still AWS)

Lightsail container service is a lower-cost way to run the same image. Push the image (as in Option A), then create a Lightsail container service, set the container port to `3000`, the health check to `/api/status`, and the `ANTHROPIC_API_KEY` environment variable.

## Option D: Render (fastest, already configured)

The repo ships a `render.yaml` blueprint. In the Render dashboard choose New, Blueprint, connect this repo, and Render reads the file. Set `ANTHROPIC_API_KEY` when prompted. The free plan sleeps after inactivity (a 30 to 60 second cold start on the first request after idle) and uses an ephemeral disk (the seed audits cover that). Use the Starter plan for always-on, or attach a Render Disk at `web/.audits` for durable storage.

## Verifying a deployment

Once it is live, check:

- `GET /api/status` returns 200 and shows whether the Claude path is active.
- `/` , `/audit`, and `/benchmark` load.
- `/audit/1os031w-n` (CRISPR) and `/audit/1bqkki0-l` (FOURIER) load from the seed.
