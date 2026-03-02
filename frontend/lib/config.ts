// SPDX-License-Identifier: MIT

/**
 * Application configuration loaded from environment variables.
 * All client-side env vars use the NEXT_PUBLIC_ prefix.
 */
export const config = {
  /** API Gateway REST endpoint for admin, leads, feedback, escalation APIs */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',

  /** Chat Lambda Function URL with SSE streaming support */
  chatFunctionUrl: process.env.NEXT_PUBLIC_CHAT_FUNCTION_URL ?? '',

  /** Cognito User Pool ID */
  cognitoUserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? '',

  /** Cognito User Pool Client ID */
  cognitoClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? '',

  /** AWS Region for Cognito and other services */
  awsRegion: process.env.NEXT_PUBLIC_AWS_REGION ?? 'us-east-1',
};

/**
 * Build a full API Gateway endpoint URL from a relative path.
 */
export function getApiEndpoint(path: string = ''): string {
  const baseUrl = config.apiUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
