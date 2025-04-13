/**
 * JSON-RPC Standard Error Codes
 */
export enum JsonRpcErrorCode {
  // Standard error codes
  ParseError = -32700,      // Invalid JSON
  InvalidRequest = -32600,  // Invalid request
  MethodNotFound = -32601,  // Method not found
  InvalidParams = -32602,   // Invalid parameters
  InternalError = -32603,   // Internal error

  // Server error code range: -32000 ~ -32099
  ServerError = -32000,     // General server error
  ConfigError = -32001,     // Configuration error
  AuthError = -32002,       // Authentication error
  ExecutionError = -32003,  // Execution error
  TimeoutError = -32004,    // Timeout error
}

/**
 * Mapping from string error codes to JSON-RPC error codes
 */
export const ErrorCodeMapping: Record<string, JsonRpcErrorCode> = {
  // Existing LokiClientError codes
  "query_execution_failed": JsonRpcErrorCode.ExecutionError,
  "execution_failed": JsonRpcErrorCode.ExecutionError,
  
  // Detailed error codes based on exit codes (common patterns)
  "query_execution_failed_1": JsonRpcErrorCode.ExecutionError,  // General command error
  "query_execution_failed_2": JsonRpcErrorCode.InvalidParams,   // Invalid usage/parameters
  "query_execution_failed_127": JsonRpcErrorCode.ExecutionError, // Command not found
  "query_execution_failed_130": JsonRpcErrorCode.TimeoutError,  // Timeout
  
  "execution_failed_1": JsonRpcErrorCode.ExecutionError,
  "execution_failed_2": JsonRpcErrorCode.InvalidParams,
  "execution_failed_127": JsonRpcErrorCode.ExecutionError,
  "execution_failed_130": JsonRpcErrorCode.TimeoutError,
  
  // Existing LokiAuthError codes
  "config_load_error": JsonRpcErrorCode.ConfigError,
};

/**
 * Loki client related error
 */
export class LokiClientError extends Error {
  jsonRpcCode: JsonRpcErrorCode;
  code: string;
  details?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    options?: { cause?: Error; details?: Record<string, any> }
  ) {
    super(message, { cause: options?.cause });
    this.name = "LokiClientError";
    this.code = code;
    this.details = options?.details;
    
    // Assign JSON-RPC error code corresponding to the string code, or use ServerError as default
    this.jsonRpcCode = ErrorCodeMapping[code] || JsonRpcErrorCode.ServerError;
  }
}

/**
 * Loki authentication related error
 */
export class LokiAuthError extends Error {
  jsonRpcCode: JsonRpcErrorCode;
  code: string;
  details?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    options?: { cause?: Error; details?: Record<string, any> }
  ) {
    super(message, { cause: options?.cause });
    this.name = "LokiAuthError";
    this.code = code;
    this.details = options?.details;
    
    // Assign JSON-RPC error code corresponding to the string code, or use AuthError as default
    this.jsonRpcCode = ErrorCodeMapping[code] || JsonRpcErrorCode.AuthError;
  }
}
