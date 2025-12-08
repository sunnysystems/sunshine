'use client';

import { useState, useRef } from 'react';

import Image from 'next/image';

import { Upload, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

interface LogoUploadProps {
  organizationId: string;
  currentLogoUrl?: string | null;
  currentLogoDarkUrl?: string | null;
  organizationName: string;
}

export function LogoUpload({ organizationId, currentLogoUrl, currentLogoDarkUrl, organizationName }: LogoUploadProps) {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingDark, setIsUploadingDark] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [previewDarkUrl, setPreviewDarkUrl] = useState<string | null>(currentLogoDarkUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDarkInputRef = useRef<HTMLInputElement>(null);

  const defaultLogoUrl = process.env.NEXT_PUBLIC_DEFAULT_LOGO_URL || '/logo.svg';

  const validateFile = (file: File): boolean => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an image file (JPEG, PNG, GIF, WebP, or SVG)');
      return false;
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 5MB limit');
      return false;
    }

    return true;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateFile(file)) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    handleUpload(file);
  };

  const handleDarkFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateFile(file)) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewDarkUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    handleDarkUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload logo');
      }

      if (data.logoUrl) {
        setPreviewUrl(data.logoUrl);
        toast.success(t('settings.logoUpload.success'));
        // Refresh the page to update the navbar
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(error instanceof Error ? error.message : t('settings.logoUpload.error'));
      // Reset preview on error
      setPreviewUrl(currentLogoUrl || null);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDarkUpload = async (file: File) => {
    setIsUploadingDark(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/organizations/${organizationId}/logo-dark`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload dark logo');
      }

      if (data.logoUrl) {
        setPreviewDarkUrl(data.logoUrl);
        toast.success(t('settings.logoUpload.darkSuccess') || 'Dark mode logo uploaded successfully');
        // Refresh the page to update the navbar
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading dark logo:', error);
      toast.error(error instanceof Error ? error.message : (t('settings.logoUpload.darkError') || 'Failed to upload dark logo'));
      // Reset preview on error
      setPreviewDarkUrl(currentLogoDarkUrl || null);
    } finally {
      setIsUploadingDark(false);
      // Reset file input
      if (fileDarkInputRef.current) {
        fileDarkInputRef.current.value = '';
      }
    }
  };

  const handleRemoveDarkLogo = async () => {
    setIsUploadingDark(true);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/logo-dark`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove dark logo');
      }

      setPreviewDarkUrl(null);
      toast.success(t('settings.logoUpload.darkRemoved') || 'Dark mode logo removed successfully');
      // Refresh the page to update the navbar
      window.location.reload();
    } catch (error) {
      console.error('Error removing dark logo:', error);
      toast.error(error instanceof Error ? error.message : (t('settings.logoUpload.darkRemoveError') || 'Failed to remove dark logo'));
    } finally {
      setIsUploadingDark(false);
    }
  };

  const displayLogoUrl = previewUrl || defaultLogoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.logoUpload.title')}</CardTitle>
        <CardDescription>
          {t('settings.logoUpload.description', { name: organizationName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Light Mode Logo Section */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t('settings.logoUpload.lightModeLogo') || 'Logo (Light Mode)'}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.logoUpload.lightModeDescription') || 'This logo will be used in light mode. In dark mode, it will be inverted if no dark mode logo is provided.'}
              </p>
            </div>
            
            {/* Current Logo Preview */}
            <div className="flex items-center gap-6">
              <div className="relative h-20 w-20 flex-shrink-0 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                {displayLogoUrl ? (
                  <Image
                    src={displayLogoUrl}
                    alt={`${organizationName} logo`}
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t('settings.logoUpload.currentLogo')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentLogoUrl ? t('settings.logoUpload.customLogo') : t('settings.logoUpload.defaultLogo')}
                </p>
              </div>
            </div>

            {/* Upload Button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={handleFileSelect}
                className="hidden"
                id="logo-upload"
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.logoUpload.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {currentLogoUrl ? t('settings.logoUpload.changeLogo') : t('settings.logoUpload.uploadLogo')}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.logoUpload.recommendedSize')}
              </p>
            </div>
          </div>

          <Separator />

          {/* Dark Mode Logo Section */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t('settings.logoUpload.darkModeLogo') || 'Logo (Dark Mode)'}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.logoUpload.darkModeDescription') || 'Optional. If provided, this logo will be used in dark mode without inversion. If not provided, the light mode logo will be inverted in dark mode.'}
              </p>
            </div>
            
            {/* Current Dark Logo Preview */}
            <div className="flex items-center gap-6">
              <div className="relative h-20 w-20 flex-shrink-0 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                {previewDarkUrl ? (
                  <Image
                    src={previewDarkUrl}
                    alt={`${organizationName} dark logo`}
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t('settings.logoUpload.currentDarkLogo') || 'Current Dark Mode Logo'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentLogoDarkUrl ? t('settings.logoUpload.customLogo') : (t('settings.logoUpload.notSet') || 'Not set')}
                </p>
              </div>
            </div>

            {/* Upload/Remove Buttons */}
            <div className="flex gap-2">
              <input
                ref={fileDarkInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={handleDarkFileSelect}
                className="hidden"
                id="logo-dark-upload"
                disabled={isUploadingDark}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileDarkInputRef.current?.click()}
                disabled={isUploadingDark}
              >
                {isUploadingDark ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.logoUpload.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {currentLogoDarkUrl ? (t('settings.logoUpload.changeDarkLogo') || 'Change Dark Logo') : (t('settings.logoUpload.uploadDarkLogo') || 'Upload Dark Logo')}
                  </>
                )}
              </Button>
              {currentLogoDarkUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemoveDarkLogo}
                  disabled={isUploadingDark}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('settings.logoUpload.removeDarkLogo') || 'Remove'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.logoUpload.darkModeNote') || 'Note: The default logo will never be inverted, even in dark mode.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

