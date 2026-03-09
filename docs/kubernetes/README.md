# Kubernetes Deployment

Deploy the OGC proxy on Kubernetes.

## Prerequisites

- Kubernetes cluster with `kubectl` configured
- Ingress controller (nginx-ingress recommended)

## Steps

### 1. Create the namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Create the config from your collections.yaml

```bash
kubectl create configmap ogc-proxy-config \
  --from-file=collections.yaml=../path/to/your/collections.yaml \
  -n ogc-proxy
```

Or edit `configmap.yaml` and apply:

```bash
kubectl apply -f configmap.yaml
```

### 3. Deploy Redis

```bash
kubectl apply -f redis.yaml
```

### 4. Set environment variables

Edit `deployment.yaml` to set:
- `UPSTREAM_HOST` — your upstream API base URL
- Any other env vars (see `.env.example` in the examples/ directory)

For secrets (JWT keys, etc.), use Kubernetes Secrets:

```bash
kubectl create secret generic ogc-proxy-secrets \
  --from-literal=JWT_HOST=https://auth.your-city.com \
  -n ogc-proxy
```

### 5. Deploy the proxy

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### 6. Configure Ingress

Edit `ingress.yaml` with your domain, then:

```bash
kubectl apply -f ingress.yaml
```

### Custom plugins

To mount custom plugins, add a ConfigMap or PersistentVolumeClaim and mount it at `/app/plugins` in the deployment.

## Updating

```bash
kubectl set image deployment/ogc-proxy \
  ogc-proxy=ghcr.io/VilledeMontreal/ogc-proxy:1.2.0 \
  -n ogc-proxy
```
