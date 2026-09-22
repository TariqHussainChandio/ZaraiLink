# Runtime observations (2026-09-21 and 2026-09-22)

Raw output from the emulator runs behind the claims in `p2-expo-2026-09.md`, so each claim can be checked
without repeating the run. Emulator: Android 16 (API 36), x86_64, local Supabase stack, local API.

## New architecture and Hermes

DevTools target list (`http://127.0.0.1:8081/json/list`), debug build:

```
"title": "com.zarailink (Google sdk_gphone64_x86_64)",
"description": "React Native Bridgeless [C++ connection]",
"deviceName": "sdk_gphone64_x86_64 - 16 - API 36",
```

App start, from `adb logcat` (debug build, then release build):

```
I ReactNativeJS: Running "main" with {"rootTag":1,"initialProps":{},"fabric":true}
I ReactNativeJS: Running "main"
```

`hermes-compiler` 250829098.0.17 (npm). `libhermesvm.so` is in both the old and new APKs, and no legacy
`libhermes.so` is in either.

## Reset link, cold start (debug build)

A real reset was requested in the app, the app process was killed, and the emailed link was opened with `adb`.
The developer launcher appears first (the debug build only). After choosing the recent server in it, the app showed
the new-password screen:

```
link ready, has code: True
app process after force-stop: none
screen after the cold start: ['App Icon', 'ZaraiLink', 'Development Build', 'User', 'DEVELOPMENT SERVERS', ...]
screen after choosing the recent server: ['Set a new password', 'Choose a new password for your ZaraiLink account.',
                                          'New password', 'Confirm password', 'Update password']
```

The release build's cold start could not be observed: release blocks plain HTTP, so the code exchange cannot
reach the local server.

## Backend errors during the five sign-ins (both builds, every run)

```
GET /api/v1/consultations/assigned HTTP/1.1" 500 Internal Server Error
GET /api/v1/consultations/mine HTTP/1.1" 500 Internal Server Error
```

Cause: `PGRST200`, no foreign key `consultations_expert_id_fkey` (baseline defect N2).

## R8 and the native error classes

Expo derives a JavaScript error code from the Kotlin class name at runtime. `mapping.txt` of the release build,
before and after `extraProguardRules` was added to `app.config.ts`:

```
before: expo.modules.imagepicker.UserRejectedPermissionsException -> O4.x:
        expo.modules.imagepicker.MissingActivityToHandleIntent    -> O4.s:
after:  expo.modules.imagepicker.UserRejectedPermissionsException -> expo.modules.imagepicker.UserRejectedPermissionsException:
        expo.modules.imagepicker.MissingActivityToHandleIntent    -> expo.modules.imagepicker.MissingActivityToHandleIntent:
```

## Photo upload, minified release build (test-only variant that allows plain HTTP)

Farmer: Profile, Edit Profile, avatar, the system photo picker, one photo, Save Changes. The source photo is
`IMG_20260922_030239.jpg`, `mime_type=image/jpeg`, `_size=30973` in the emulator's MediaStore. Local database,
`storage.objects` after the save:

```
avatars | c948426b-e08f-48cf-b980-3c2ade958edd/avatar-... | image/jpeg | 30973 | 22:07:19
```

Bucket, owner-scoped path, MIME type, and byte count all match, so the file arrived intact with the content type
the app sent from `mimeType`.

Camera on the same build: the permission prompt appeared; refusing it left the form untouched with no crash;
granting it opened the system camera, and the confirmed photo appeared as a thumbnail in the New Listing form.
Publishing that listing, and therefore uploading a camera photo, was not exercised: the create-listing call hits
the known write-path defect (N1).
