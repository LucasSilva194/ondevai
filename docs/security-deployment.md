# Security deployment notes

The `202610020000_security_hardening` migration applies PocketBase rate limits and 30-day request logs. Email OTP/MFA remains disabled until PocketHost email delivery is configured and verified; the migration contains a TODO to enable it then.

The static frontend sends CSP and browser security headers through `public/_headers`. Configure the PocketBase host separately to serve HTTPS and HSTS. The repository cannot enable disk encryption, immutable external log storage, or alert delivery for the managed PocketBase host. Configure those controls in the provider, keep the encryption and superuser secrets outside the client build, and alert on repeated authentication failures and rate-limit events.
