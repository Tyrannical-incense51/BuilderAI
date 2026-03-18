-- Add Vercel deployment token to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vercel_token TEXT;
