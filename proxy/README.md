# Proxy Configuration for Polymarket CLOB API

This folder contains a ready-to-use NGINX reverse proxy for the Polymarket CLOB API. 
You can clone this and run it on a DigitalOcean droplet (or any VM) using Docker.

## Recommended Region

**Use London (LON1)** - Polymarket's CLOB servers are in London and the API is geo-restricted in the USA. 
A London droplet gives the lowest latency and avoids US restrictions.

## Setup Instructions

1. Install Docker and Docker Compose on your VM if you haven't already:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

2. Clone this repository on your VM:
```bash
git clone https://github.com/polyblocks/polyblocks.git
cd polyblocks/proxy
```

3. Start the proxy in the background:
```bash
sudo docker compose up -d
```

4. Verify it's running:
```bash
curl -I http://localhost/
```

5. Point your application to the proxy:
Update your `.env` file in the main application:
```env
POLYMARKET_CLOB_HOST=http://<YOUR_VM_IP>
```
