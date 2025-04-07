# Loki MCP Server

Loki MCP Server is a [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/mcp) interface for querying Grafana Loki logs using `logcli`. The server enables AI assistants to access and analyze log data from Loki directly.

## Features

- Query Loki logs with full LogQL support
- Get label values and metadata
- Authentication and configuration support via environment variables or config files
- Provides formatted results in different output formats (default, raw, JSON lines)

## Prerequisites

- Node.js v16 or higher
- TypeScript
- [Grafana Loki logcli](https://grafana.com/docs/loki/latest/tools/logcli/) installed and accessible in your PATH
- Access to a Loki server instance

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/loki-mcp.git
cd loki-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Configuration

You can configure Loki access using:

### Environment Variables

- `LOKI_ADDR`: Loki server address (URL)
- `LOKI_USERNAME`: Username for basic auth
- `LOKI_PASSWORD`: Password for basic auth
- `LOKI_TENANT_ID`: Tenant ID for multi-tenant Loki
- `LOKI_BEARER_TOKEN`: Bearer token for authentication
- `LOKI_BEARER_TOKEN_FILE`: File containing bearer token
- `LOKI_CA_FILE`: Custom CA file for TLS
- `LOKI_CERT_FILE`: Client certificate file for TLS
- `LOKI_KEY_FILE`: Client key file for TLS
- `LOKI_ORG_ID`: Organization ID for multi-org setups
- `LOKI_TLS_SKIP_VERIFY`: Skip TLS verification ("true" or "false")
- `LOKI_CONFIG_PATH`: Custom path to config file
- `DEBUG`: Enable debug logging

### Config Files

Alternatively, create a `logcli-config.yaml` file in one of these locations:

- Custom path specified by `LOKI_CONFIG_PATH`
- Current working directory
- Your home directory (`~/.logcli-config.yaml`)

Example config file:

```yaml
addr: https://loki.example.com
username: user
password: pass
tenant_id: mytenant
```

## Usage

Start the server:

```bash
npm start
```

For development:

```bash
npm run dev
```

## Available MCP Tools

### query-loki

Query logs from Loki with filtering options.

Parameters:

- `query` (required): Loki query string (LogQL)
- `from`: Start timestamp (e.g. "2023-01-01T12:00:00Z")
- `to`: End timestamp (e.g. "2023-01-01T13:00:00Z")
- `limit`: Maximum number of logs to return
- `batch`: Batch size for query results
- `output`: Output format ("default", "raw", or "jsonl")
- `quiet`: Suppress query metadata
- `forward`: Display results in chronological order

### get-label-values

Retrieve all values for a specific label.

Parameters:

- `label` (required): Label name to get values for

### get-labels

Retrieve all available labels.

No parameters required.

## Development

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Run tests
npm run test
```

## License

ISC
