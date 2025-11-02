"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { actionClient } from "./safe-action";
import {
  updateProfileSchema,
  changePasswordSchema,
  updatePreferencesSchema,
  enable2FASchema,
  disable2FASchema,
  deleteAccountSchema,
} from "@/lib/form-schema";
import { debugDatabase, logError } from "@/lib/debug";

// Update profile action
export const updateProfileAction = actionClient
  .inputSchema(updateProfileSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { name } = parsedInput;

      // Update user name
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ name })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update profile', { error: updateError });
        throw new Error('Failed to update profile');
      }

      debugDatabase('Profile updated successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: 'Profile updated successfully',
      };
    } catch (error) {
      logError(error, 'updateProfileAction');
      throw error;
    }
  });

// Change password action
export const changePasswordAction = actionClient
  .inputSchema(changePasswordSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { currentPassword, newPassword } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify current password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ password_hash: newPasswordHash })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update password', { error: updateError });
        throw new Error('Failed to update password');
      }

      debugDatabase('Password updated successfully', { userId: session.user.id });

      return {
        success: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      logError(error, 'changePasswordAction');
      throw error;
    }
  });

// Update preferences action
export const updatePreferencesAction = actionClient
  .inputSchema(updatePreferencesSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { language, theme } = parsedInput;

      // Update preferences
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          preferences: { language, theme },
          theme_preference: theme,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to update preferences', { error: updateError });
        throw new Error('Failed to update preferences');
      }

      debugDatabase('Preferences updated successfully', { userId: session.user.id, language, theme });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: 'Preferences updated successfully',
      };
    } catch (error) {
      logError(error, 'updatePreferencesAction');
      throw error;
    }
  });

// Generate MFA secret (mock)
export const generateMFASecretAction = actionClient
  .action(async () => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      // Generate mock secret and backup codes
      const secret = `MOCK-${randomBytes(16).toString('hex').toUpperCase()}`;
      const backupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        backupCodes.push(randomBytes(4).toString('hex').toUpperCase());
      }

      // Mock QR code URL (just an example)
      const qrCodeUrl = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/><text x="50" y="50" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-size="12">MOCK QR</text></svg>`).toString('base64')}`;

      debugDatabase('MFA secret generated', { userId: session.user.id });

      return {
        success: true,
        data: {
          secret,
          qrCodeUrl,
          backupCodes,
        },
      };
    } catch (error) {
      logError(error, 'generateMFASecretAction');
      throw error;
    }
  });

// Verify and enable MFA (mock)
export const verifyAndEnableMFAAction = actionClient
  .inputSchema(enable2FASchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      // For mock, accept any 6-digit code
      const { verificationCode } = parsedInput;

      // Generate mock backup codes
      const backupCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        backupCodes.push(randomBytes(4).toString('hex').toUpperCase());
      }

      const secret = `MOCK-${randomBytes(16).toString('hex').toUpperCase()}`;

      // Enable MFA
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          mfa_enabled: true,
          mfa_secret: secret,
          mfa_backup_codes: backupCodes,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to enable MFA', { error: updateError });
        throw new Error('Failed to enable MFA');
      }

      debugDatabase('MFA enabled successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: '2FA enabled successfully',
        data: {
          backupCodes,
        },
      };
    } catch (error) {
      logError(error, 'verifyAndEnableMFAAction');
      throw error;
    }
  });

// Disable MFA action
export const disableMFAAction = actionClient
  .inputSchema(disable2FASchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { password } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Password is incorrect');
      }

      // Disable MFA
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          mfa_enabled: false,
          mfa_secret: null,
          mfa_backup_codes: null,
        })
        .eq('id', session.user.id);

      if (updateError) {
        debugDatabase('Failed to disable MFA', { error: updateError });
        throw new Error('Failed to disable MFA');
      }

      debugDatabase('MFA disabled successfully', { userId: session.user.id });

      revalidatePath('/[tenant]/profile', 'page');

      return {
        success: true,
        message: '2FA disabled successfully',
      };
    } catch (error) {
      logError(error, 'disableMFAAction');
      throw error;
    }
  });

// Delete account action
export const deleteAccountAction = actionClient
  .inputSchema(deleteAccountSchema)
  .action(async ({ parsedInput }) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const { password } = parsedInput;

      // Get user from database
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Verify password
      if (!user.password_hash) {
        throw new Error('No password set for this account');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new Error('Password is incorrect');
      }

      // Delete user (cascade will handle related records)
      const { error: deleteError } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', session.user.id);

      if (deleteError) {
        debugDatabase('Failed to delete account', { error: deleteError });
        throw new Error('Failed to delete account');
      }

      debugDatabase('Account deleted successfully', { userId: session.user.id });

      return {
        success: true,
        message: 'Account deleted successfully',
      };
    } catch (error) {
      logError(error, 'deleteAccountAction');
      throw error;
    }
  });

// Get user profile data
export const getUserProfileAction = actionClient
  .action(async () => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      // Get user data with preferences
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('name, email, email_verified, created_at, last_login_at, preferences, theme_preference, mfa_enabled')
        .eq('id', session.user.id)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Get organization count
      const { data: organizations, error: orgError } = await supabaseAdmin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

      return {
        success: true,
        data: {
          name: user.name,
          email: user.email,
          emailVerified: user.email_verified,
          accountCreated: user.created_at,
          lastLogin: user.last_login_at,
          preferences: user.preferences || { language: 'pt-BR', theme: 'system' },
          themePreference: user.theme_preference || 'system',
          mfaEnabled: user.mfa_enabled || false,
          organizationCount: organizations?.length || 0,
        },
      };
    } catch (error) {
      logError(error, 'getUserProfileAction');
      throw error;
    }
  });

