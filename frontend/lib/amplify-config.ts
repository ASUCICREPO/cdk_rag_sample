// SPDX-License-Identifier: MIT

'use client';

import { Amplify } from 'aws-amplify';
import { config } from './config';

/**
 * Configure AWS Amplify with Cognito authentication settings.
 * Call this once at app startup (e.g. in a client-side layout wrapper).
 */
export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
      },
    },
  });
}
