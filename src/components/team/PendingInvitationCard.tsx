'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, X, RotateCcw, Loader2 } from 'lucide-react';

import { resendInvitationAction, cancelInvitationAction } from '@/actions/team-actions';
import { PendingInvitation } from '@/actions/team-actions';
import { canResendInvitations, canCancelInvitations } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PendingInvitationCardProps {
  invitation: PendingInvitation;
  currentUserRole: 'owner' | 'admin' | 'member';
  organizationId: string;
}

export function PendingInvitationCard({ 
  invitation, 
  currentUserRole, 
  organizationId
}: PendingInvitationCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatExpirationDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      return 'Expired';
    } else if (diffDays === 1) {
      return 'Expires tomorrow';
    } else {
      return `Expires in ${diffDays} days`;
    }
  };

  const handleResendInvitation = async () => {
    setIsLoading(true);
    try {
      const result = await resendInvitationAction({
        invitationId: invitation.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(result.data.message);
      } else {
        toast.error(result?.data?.message || 'Failed to resend invitation');
      }
    } catch (error) {
      console.error('Error resending invitation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to resend invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelInvitation = async () => {
    setIsLoading(true);
    try {
      const result = await cancelInvitationAction({
        invitationId: invitation.id,
        organizationId,
      });

      if (result?.data?.success) {
        toast.success(result.data.message);
        setShowCancelDialog(false);
      } else {
        toast.error(result?.data?.message || 'Failed to cancel invitation');
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to cancel invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const canResend = canResendInvitations(currentUserRole);
  const canCancel = canCancelInvitations(currentUserRole);
  const isExpired = new Date(invitation.expiresAt) < new Date();

  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="font-medium">{invitation.email}</h4>
            <p className="text-sm text-muted-foreground">
              Invited by {invitation.invitedByName}
            </p>
            <div className="flex gap-2 mt-1">
              <Badge variant={getRoleBadgeVariant(invitation.role)} className="text-xs">
                {invitation.role}
              </Badge>
              <Badge 
                variant={isExpired ? 'destructive' : 'secondary'} 
                className="text-xs"
              >
                {formatExpirationDate(invitation.expiresAt)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {new Date(invitation.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            })}
          </span>
          {(canResend || canCancel) && (
            <div className="flex gap-1">
              {canResend && !isExpired && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResendInvitation}
                  disabled={isLoading}
                  title="Resend invitation"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isLoading}
                  title="Cancel invitation"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation for <strong>{invitation.email}</strong>? 
              They will no longer be able to use this invitation link to join the organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvitation}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
