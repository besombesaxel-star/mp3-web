# Graph Report - .  (2026-07-10)

## Corpus Check
- 155 files · ~120,867 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1005 nodes · 2328 edges · 77 communities (61 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.66)
- Token cost: 0 input · 329,281 output

## Community Hubs (Navigation)
- Track Storage & Upload Backends
- Account Profile & EQ Presets
- TypeScript Configuration
- Admin Badges & Storage Management
- Track List UI Components
- Playback Session & Server Auth
- App Launcher Script
- App Shell & PWA Layout
- Artist Pages & Top Charts
- Player Context: EQ & Theme State
- Upload Page & Audio Processing
- Activity Stats & Weekly Challenges
- Social: Follow, Notifications, Reactions
- Messaging & Public Catalog
- Radio Station Scheduling
- Library Page & Tracks Sync
- Public Profile, Achievements & Wrapped
- Supabase Migration Script
- Account Settings & Avatar Cropper
- Auth Provider & Account Switching
- Dynamic Backdrop & Color Extraction
- CI Workflow & README Docs
- Audio Visualizer Components
- Player Overlay & Lyrics
- Home Page & Cover Scroll Effect
- Search Page & Fuzzy Matching
- Dev Tooling Dependencies
- Chat API & Supabase Buckets
- Messages Inbox & Notification Bell
- Keyboard Shortcuts, MiniPlayer & Sidebar
- Runtime Dependencies
- Global Stats API
- Upload Signing & Rate Limiting
- Playlists Page & Toasts
- NPM Scripts
- Push Notification Subscriptions
- Player Stats Helpers
- 4G Tunnel Sharing Script
- Device Sessions API
- Activity Log API
- Launcher Heartbeat & Instrumentation
- Global Chat UI
- ID3 Tag Parsing
- Settings Page & EQ Editor
- Radio Live Page UI
- Accent Color Extraction
- UI Sound Effects
- Service Worker Caching
- Device ID Utility
- Package Metadata
- Playback E2E Test
- Extract Accent Helper
- PWA Manifest & 512 Icon
- Next.js Config
- Blossom Background Image
- ESLint Config
- Node Types Dependency
- React-DOM Types Dependency
- PostCSS Config
- PWA 192 Icon
- Birds Background Image
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- Music Cover Art Image
- Apple Touch Icon
- File Icon Asset
- Globe Icon Asset

## God Nodes (most connected - your core abstractions)
1. `getSupabaseAdmin()` - 67 edges
2. `readAuthenticatedUser()` - 62 edges
3. `usePlayer()` - 54 edges
4. `useAuth()` - 40 edges
5. `readAccountProfile()` - 32 edges
6. `createAuthorizedHeaders()` - 29 edges
7. `saveAccountProfile()` - 23 edges
8. `getSupabaseBrowserAuthClient()` - 21 edges
9. `PlayerProvider()` - 16 edges
10. `listTracksForApi()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `AuthProvider()` --calls--> `getSupabaseBrowserAuthClient()`  [EXTRACTED]
  app/AuthProvider.tsx → lib/supabaseAuth.ts
- `GlobalChat()` --calls--> `isAdminUser()`  [EXTRACTED]
  app/GlobalChat.tsx → lib/adminAccess.ts
- `GlobalChat()` --calls--> `getPublicProfileHref()`  [EXTRACTED]
  app/GlobalChat.tsx → lib/publicLinks.ts
- `GlobalChat()` --calls--> `getSupabaseBrowserAuthClient()`  [EXTRACTED]
  app/GlobalChat.tsx → lib/supabaseAuth.ts
- `NotificationBell()` --calls--> `createAuthorizedHeaders()`  [EXTRACTED]
  app/NotificationBell.tsx → lib/clientAuth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI pipeline: lint-and-build gates the e2e job** — _github_workflows_ci_workflow, _github_workflows_ci_lint_and_build, _github_workflows_ci_e2e [EXTRACTED 1.00]
- **Supabase cloud mode enables shared catalog and cross-user sync** — readme_supabase_storage_mode, readme_shared_catalog, readme_playlists_favorites_sync [EXTRACTED 0.90]

## Communities (77 total, 16 thin omitted)

### Community 0 - "Track Storage & Upload Backends"
Cohesion: 0.06
Nodes (94): ACCOUNT_DATA_PREFIXES, FileObjectLike, GET(), listAllFiles(), sumSize(), GET(), getErrorMessage(), POST() (+86 more)

### Community 1 - "Account Profile & EQ Presets"
Cohesion: 0.15
Nodes (31): EQ_PRESETS, GET(), PUT(), serializeTrack(), GET(), AccountPlaylist, AccountProfileData, EMPTY_PROFILE (+23 more)

### Community 2 - "TypeScript Configuration"
Cohesion: 0.06
Nodes (30): ./*, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+22 more)

### Community 3 - "Admin Badges & Storage Management"
Cohesion: 0.14
Nodes (23): AdminBadgesPage(), Assignments, getErrorMessage(), AdminStoragePage(), formatBytes(), getErrorMessage(), StorageResponse, TopUser (+15 more)

### Community 4 - "Track List UI Components"
Cohesion: 0.13
Nodes (21): AlbumCard(), AlbumCardProps, EmbedPlayer(), formatTime(), FavoriteRow(), FavoritesPage(), FeedPage(), FeedRow() (+13 more)

### Community 5 - "Playback Session & Server Auth"
Cohesion: 0.17
Nodes (20): DELETE(), extractPublicUrl(), POST(), DELETE(), GET(), getPath(), POST(), GET() (+12 more)

### Community 6 - "App Launcher Script"
Cohesion: 0.13
Nodes (18): Ensure-Dependencies(), Find-FreePort(), Get-AppRootFromNextCliPath(), Get-AppRootFromProcessId(), Get-LatestInputTimestamp(), Get-ListenerProcessId(), Get-LogTail(), Invoke-NpmRedirected() (+10 more)

### Community 7 - "App Shell & PWA Layout"
Cohesion: 0.11
Nodes (15): AppShell(), LandscapeGuard(), LauncherHeartbeat(), geistMono, geistSans, metadata, viewport, isActivePath() (+7 more)

### Community 8 - "Artist Pages & Top Charts"
Cohesion: 0.13
Nodes (18): ArtistData, ArtistOwner, ArtistPage(), ArtistResponse, ArtistTrack, formatListenTime(), ListenerEntry, MAIN_TABS (+10 more)

### Community 9 - "Player Context: EQ & Theme State"
Cohesion: 0.09
Nodes (19): AccountResponse, AchievementToast, ApiTrack, Ctx, DEFAULT_CUSTOM_EQ_GAINS, EQ_BANDS, EQ_ORDER, EQ_PRESET_GAINS (+11 more)

### Community 10 - "Upload Page & Audio Processing"
Cohesion: 0.13
Nodes (17): BatchFile, BatchStatus, CompleteUploadResponse, guessTitleFromFile(), MetaResponse, normalizeText(), saveMetaForSrc(), SignUploadResponse (+9 more)

### Community 11 - "Activity Stats & Weekly Challenges"
Cohesion: 0.13
Nodes (16): ActivityHeatmap(), ActivityHeatmapProps, Cell, LEVEL_COLORS, levelForCount(), MONTH_LABELS, toDayKey(), PlayerStats (+8 more)

### Community 12 - "Social: Follow, Notifications, Reactions"
Cohesion: 0.21
Nodes (15): Ctx, DELETE(), POST(), GET(), PUT(), POST(), ALLOWED_EMOJIS, lastReactionAtByUser (+7 more)

### Community 13 - "Messaging & Public Catalog"
Cohesion: 0.19
Nodes (17): GET(), GET(), appendMessage(), DirectMessage, getConversationPath(), getOtherParticipant(), listConversationIdsForUser(), readConversation() (+9 more)

### Community 14 - "Radio Station Scheduling"
Cohesion: 0.18
Nodes (19): GET(), buildSchedule(), getDayEpoch(), getDayKey(), getPath(), getRadioNowPlaying(), getRadioSchedule(), mapWithConcurrency() (+11 more)

### Community 15 - "Library Page & Tracks Sync"
Cohesion: 0.18
Nodes (15): ApiTrack, DeleteTrackResponse, getErrorMessage(), LibraryListRow(), LibraryPage(), MetaSaveResponse, normalizeTitle(), toTrack() (+7 more)

### Community 16 - "Public Profile, Achievements & Wrapped"
Cohesion: 0.14
Nodes (17): BADGE_STYLES, formatCount(), formatJoinedAt(), PlayerTrack, ProfileLink, PublicProfile, PublicProfileResponse, PublicTrack (+9 more)

### Community 17 - "Supabase Migration Script"
Cohesion: 0.20
Nodes (20): dedupeTracks(), defaultTitleFromBase(), ensureBucketReady(), findCoverForBase(), force, getMetaForFile(), getPublicUrl(), hasErrorMessage() (+12 more)

### Community 18 - "Account Settings & Avatar Cropper"
Cohesion: 0.12
Nodes (13): AccountPage(), AccountResponse, AccountTrack, ACTIVITY_LABELS, ActivityEvent, AVATAR_GRADIENTS, avatarGradient(), detectPlatform() (+5 more)

### Community 19 - "Auth Provider & Account Switching"
Cohesion: 0.22
Nodes (16): AuthContext, AuthContextValue, AuthProvider(), getStoredAccount(), isStoredAccount(), listStoredAccounts(), readAll(), removeStoredAccount() (+8 more)

### Community 20 - "Dynamic Backdrop & Color Extraction"
Cohesion: 0.27
Nodes (19): BackdropPalette, clamp(), clampByte(), colorDistance(), derivePaletteFromAccent(), DynamicBackdrop(), extractPaletteFromCover(), getThemePalette() (+11 more)

### Community 21 - "CI Workflow & README Docs"
Cohesion: 0.13
Nodes (19): e2e job, lint-and-build job, npm run build, npm ci (install dependencies), npm run lint, npm run test:e2e, npx playwright install --with-deps chromium, CI Workflow (+11 more)

### Community 22 - "Audio Visualizer Components"
Cohesion: 0.21
Nodes (15): AudioBars(), clamp01(), mix(), Props, AudioEqualizer(), clamp01(), Props, ensureConnected() (+7 more)

### Community 23 - "Player Overlay & Lyrics"
Cohesion: 0.18
Nodes (16): vibrate(), clampByte(), hslToRgb(), parseColorToRgb(), PlayerOverlay(), rgbToHsl(), toVividMobileAccent(), withAlpha() (+8 more)

### Community 24 - "Home Page & Cover Scroll Effect"
Cohesion: 0.19
Nodes (16): ApiTrack, getCoverDedupKey(), getErrorMessage(), getTodayMoment(), Home(), RecentCard, TodayMoment, todayMomentLabel() (+8 more)

### Community 25 - "Search Page & Fuzzy Matching"
Cohesion: 0.15
Nodes (16): ArtistCard(), ArtistEntry, ArtistRow(), escapeRegExp(), fuzzyMatch(), getErrorMessage(), HighlightedText(), levenshtein() (+8 more)

### Community 26 - "Dev Tooling Dependencies"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, localtunnel, devDependencies, eslint, eslint-config-next, localtunnel, @playwright/test (+11 more)

### Community 27 - "Chat API & Supabase Buckets"
Cohesion: 0.21
Nodes (15): ChatMessage, DELETE(), GET(), lastMessageAtByUser, POST(), readHistory(), resolveMentions(), saveHistory() (+7 more)

### Community 28 - "Messages Inbox & Notification Bell"
Cohesion: 0.21
Nodes (13): useAuth(), ConversationPreview, formatRelative(), MessagesInboxPage(), ConversationPage(), DirectMessage, formatTime(), PublicProfile (+5 more)

### Community 29 - "Keyboard Shortcuts, MiniPlayer & Sidebar"
Cohesion: 0.18
Nodes (12): KeyboardShortcuts(), SHORTCUTS, MiniPlayer(), withAlpha(), openShortcutsHelp(), subscribeShowShortcuts(), AccountQuickSwitch(), isActivePath() (+4 more)

### Community 30 - "Runtime Dependencies"
Cohesion: 0.12
Nodes (17): @breezystack/lamejs, lucide-react, music-metadata, next, dependencies, @breezystack/lamejs, lucide-react, music-metadata (+9 more)

### Community 31 - "Global Stats API"
Cohesion: 0.17
Nodes (15): ByTrackValue, cache, CachedResult, computeListenersAllTime(), computeListenersForWindow(), computeTopAllTime(), computeTopForWindow(), GET() (+7 more)

### Community 32 - "Upload Signing & Rate Limiting"
Cohesion: 0.22
Nodes (12): Ctx, GET(), POST(), getErrorMessage(), POST(), getConversationId(), createUploadTargetsForApi(), isValidAudioFileName() (+4 more)

### Community 33 - "Playlists Page & Toasts"
Cohesion: 0.19
Nodes (10): badgeToneClass(), DynamicPlaylist, getErrorMessage(), Playlist, PlaylistBadge, PlaylistsPage(), TrackWithCover, uid() (+2 more)

### Community 34 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, app:launch, app:package, app:stop, build, dev, lint, share:4g (+6 more)

### Community 35 - "Push Notification Subscriptions"
Cohesion: 0.35
Nodes (11): DELETE(), POST(), addPushSubscription(), getPushSubscriptions(), getSubscriptionsPath(), getVapidConfig(), isValidSubscription(), removePushSubscription() (+3 more)

### Community 36 - "Player Stats Helpers"
Cohesion: 0.27
Nodes (13): clamp(), computeLeaders(), emptyStats(), getDayKey(), isRecord(), normalizeArtist(), normalizeCustomEqGains(), PlayerProvider() (+5 more)

### Community 37 - "4G Tunnel Sharing Script"
Cohesion: 0.29
Nodes (11): args, cleanup(), getPublicIp(), isReachable(), main(), port, prefixPipe(), runCommand() (+3 more)

### Community 38 - "Device Sessions API"
Cohesion: 0.40
Nodes (9): DELETE(), GET(), POST(), DeviceSession, forgetDeviceSession(), getPath(), listDeviceSessions(), saveDeviceSessions() (+1 more)

### Community 39 - "Activity Log API"
Cohesion: 0.40
Nodes (8): CLIENT_REPORTABLE, GET(), POST(), ActivityEvent, ActivityEventType, getPath(), logActivity(), readActivityLog()

### Community 40 - "Launcher Heartbeat & Instrumentation"
Cohesion: 0.29
Nodes (7): POST(), register(), getState(), globalState, LauncherHeartbeatState, recordHeartbeat(), startLauncherWatchdog()

### Community 41 - "Global Chat UI"
Cohesion: 0.31
Nodes (9): formatTime(), GlobalChat(), groupMessages(), HUE_PALETTE, initials(), MessageGroup, nameHue(), Participant (+1 more)

### Community 42 - "ID3 Tag Parsing"
Cohesion: 0.31
Nodes (9): decodeText(), extensionForMimeType(), findNullTerminator(), Id3Picture, Id3Tags, parsePictureFrame(), pictureToFile(), readId3Tags() (+1 more)

### Community 43 - "Settings Page & EQ Editor"
Cohesion: 0.22
Nodes (3): EqGains, EQ_BAND_LABELS, SettingsPage()

### Community 44 - "Radio Live Page UI"
Cohesion: 0.36
Nodes (6): formatDayKey(), formatEta(), formatTime(), RadioLivePage(), RadioLiveResponse, RadioTrackData

### Community 45 - "Accent Color Extraction"
Cohesion: 0.43
Nodes (6): accentFromCover(), accentFromText(), AccentRGB, clamp(), hashString(), hslToRgb()

### Community 46 - "UI Sound Effects"
Cohesion: 0.60
Nodes (5): getContext(), playChimeSound(), playPopSound(), playTone(), unlockAudio()

### Community 48 - "Device ID Utility"
Cohesion: 0.67
Nodes (3): getDeviceId(), getDeviceLabel(), guessDeviceLabel()

### Community 49 - "Package Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 52 - "Playback E2E Test"
Cohesion: 0.50
Nodes (3): audioDir, fixtureSrc, testFilePath

### Community 54 - "PWA Manifest & 512 Icon"
Cohesion: 0.67
Nodes (3): PWA Web App Manifest Icon Set, App Icon (512x512), Black and White Spider Lily Flowers Photograph

### Community 56 - "Blossom Background Image"
Cohesion: 0.67
Nodes (3): Blossom Background Image, Cherry Blossom Motif, Dynamic Backdrop / Accent Color Source

## Knowledge Gaps
- **276 isolated node(s):** `ActivityHeatmapProps`, `Cell`, `MONTH_LABELS`, `LEVEL_COLORS`, `AlbumCardProps` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSupabaseAdmin()` connect `Track Storage & Upload Backends` to `Account Profile & EQ Presets`, `Admin Badges & Storage Management`, `Push Notification Subscriptions`, `Playback Session & Server Auth`, `Device Sessions API`, `Activity Log API`, `Social: Follow, Notifications, Reactions`, `Messaging & Public Catalog`, `Radio Station Scheduling`, `Chat API & Supabase Buckets`, `Global Stats API`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `usePlayer()` connect `Track List UI Components` to `Playlists Page & Toasts`, `Artist Pages & Top Charts`, `Global Chat UI`, `Player Context: EQ & Theme State`, `Settings Page & EQ Editor`, `Radio Live Page UI`, `Activity Stats & Weekly Challenges`, `Library Page & Tracks Sync`, `Public Profile, Achievements & Wrapped`, `Account Settings & Avatar Cropper`, `Dynamic Backdrop & Color Extraction`, `Audio Visualizer Components`, `Player Overlay & Lyrics`, `Home Page & Cover Scroll Effect`, `Search Page & Fuzzy Matching`, `Keyboard Shortcuts, MiniPlayer & Sidebar`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Messages Inbox & Notification Bell` to `Playlists Page & Toasts`, `Admin Badges & Storage Management`, `Track List UI Components`, `Player Stats Helpers`, `Artist Pages & Top Charts`, `Global Chat UI`, `Player Context: EQ & Theme State`, `Settings Page & EQ Editor`, `Upload Page & Audio Processing`, `Library Page & Tracks Sync`, `Public Profile, Achievements & Wrapped`, `Account Settings & Avatar Cropper`, `Auth Provider & Account Switching`, `Home Page & Cover Scroll Effect`, `Search Page & Fuzzy Matching`, `Keyboard Shortcuts, MiniPlayer & Sidebar`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `ActivityHeatmapProps`, `Cell`, `MONTH_LABELS` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Track Storage & Upload Backends` be split into smaller, more focused modules?**
  _Cohesion score 0.05549450549450549 - nodes in this community are weakly interconnected._
- **Should `Account Profile & EQ Presets` be split into smaller, more focused modules?**
  _Cohesion score 0.14795008912655971 - nodes in this community are weakly interconnected._
- **Should `TypeScript Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._