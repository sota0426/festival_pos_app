# App Store Release Checklist

## Code And Config

- App display name is `文化祭レジ`
- iOS bundle identifier is `com.festivalpos.app`
- `app.json` version is updated for the release
- `app.json` iOS `buildNumber` is set for the next upload
- `eas.json` production profile exists

## Apple Account

- Apple Developer Program membership is active
- App Store Connect app record is created
- Bundle ID in App Store Connect matches `com.festivalpos.app`

## Required Store Metadata

- App name
- Subtitle
- Description
- Keywords
- Support URL
- Marketing URL if needed
- Privacy Policy URL

## Privacy And Legal

- App Privacy answers are filled in App Store Connect
- Privacy Policy is published on a public URL
- Terms of Service is published on a public URL if you plan to reference it externally
- Data deletion/contact flow is prepared for users

## Assets

- App icon is finalized
- iPhone screenshots are prepared
- iPad screenshots are prepared if iPad support remains enabled

## Build And Submission

- `npx eas login`
- `npx eas build -p ios --profile production`
- `npx eas submit -p ios --profile production`
- Build is attached to the target App Store version
- Review information is filled in before submission

## Notes For This Project

- Google login and email login should be rechecked on a production iOS build before submission
- Because `supportsTablet` is enabled, App Store submission may require iPad screenshots unless this support is removed
- Apple requires a publicly accessible Privacy Policy URL in App Store Connect
