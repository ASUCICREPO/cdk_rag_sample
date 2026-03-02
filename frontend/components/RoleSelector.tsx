// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import { updateUserAttributes } from 'aws-amplify/auth';

interface RoleSelectorProps {
  currentRole: 'instructor' | 'internal_staff' | 'learner';
  onRoleChange: () => void;
}

const ROLES = [
  { value: 'learner', label: 'Learner' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'internal_staff', label: 'Internal Staff' },
] as const;

/**
 * Role selector dropdown that updates the user's custom:role attribute in Cognito.
 * After updating, triggers a re-auth to refresh the JWT token with the new role.
 */
export default function RoleSelector({ currentRole, onRoleChange }: RoleSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleChange = async (newRole: string) => {
    if (newRole === currentRole) return;

    setIsUpdating(true);
    setError(null);

    try {
      // Update the custom:role attribute in Cognito
      await updateUserAttributes({
        userAttributes: {
          'custom:role': newRole,
        },
      });

      // Trigger parent to refresh auth state (which will fetch new token with updated role)
      onRoleChange();
    } catch (err) {
      console.error('Failed to update role:', err);
      setError('Failed to update role. Please try again.');
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor="role-selector" className="sr-only">
        Select your role
      </label>
      <select
        id="role-selector"
        value={currentRole}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={isUpdating}
        className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-800 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Select your role"
      >
        {ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="absolute top-full mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
