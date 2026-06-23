# Deployment Guide: GCP Cloud Run

This guide outlines the step-by-step process to deploy **EcoTrace** onto Google Cloud Platform (GCP) using **Google Cloud Run**.

---

## Prerequisites

1. **Google Cloud Account**: A GCP account with an active billing account.
2. **Google Cloud SDK**: Install the `gcloud` command-line utility on your local machine.
3. **Docker** (Optional): Only if you want to test the container build locally before pushing.

---

## Step 1: Initialize gcloud & Select Project

Open your terminal and authenticate with your Google account:

```bash
# Log in to your GCP account
gcloud auth login

# Set your active GCP project (replace PROJECT_ID with your actual GCP Project ID)
gcloud config set project PROJECT_ID
```

---

## Step 2: Enable Required GCP APIs

To build and deploy your app, enable the Artifact Registry, Cloud Build, and Cloud Run APIs:

```bash
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com
```

---

## Step 3: Create Artifact Registry Repository

Create a Docker repository in Artifact Registry to hold your container images:

```bash
gcloud artifacts repositories create ecotrace-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for EcoTrace app"
```

---

## Step 4: Choose Deployment Method

You can deploy EcoTrace using one of the two methods below.

### Method A: One-Command Build and Deploy (Simplest)

Google Cloud Run can build your container directly from the source code using GCP's built-in buildpacks or Dockerfile:

```bash
gcloud run deploy ecotrace \
    --source . \
    --region us-central1 \
    --allow-unauthenticated
```
*GCP will upload the source code, build the container in the cloud, push it to Artifact Registry, and deploy it to a serverless Cloud Run instance. When complete, it will print the live URL!*

---

### Method B: Deploy via Cloud Build (Recommended for Production)

We have provided a `cloudbuild.yaml` file. You can trigger a structured build and deploy pipeline in GCP:

```bash
gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=_AR_REGION="us-central1",_AR_REPO="ecotrace-repo",_RUN_REGION="us-central1"
```

---

## Step 5: Verify Deployment

After deployment completes, GCP will provide a Service URL (e.g., `https://ecotrace-xxxxxx.a.run.app`).
1. Click the URL to open the live application in your browser.
2. You can monitor resource consumption, request logs, and scaling performance inside the **Google Cloud Console** under the **Cloud Run** dashboard.
