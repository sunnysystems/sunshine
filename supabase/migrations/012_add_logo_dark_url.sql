-- Add logo_dark_url column to organizations table
ALTER TABLE organizations ADD COLUMN logo_dark_url TEXT;

-- Note: This field is optional. If provided, it will be used in dark mode without inversion.
-- If not provided, the system will use logo_url with dark:invert (for custom logos) 
-- or the default logo without inversion.

