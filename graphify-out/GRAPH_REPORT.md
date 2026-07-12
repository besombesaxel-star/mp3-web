# Graph Report - .  (2026-07-13)

## Corpus Check
- 91 files · ~235,870 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1241 nodes · 2581 edges · 98 communities (76 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.71)
- Token cost: 342,547 input · 0 output

## Community Hubs (Navigation)
- Admin Storage API
- Track Management API & UI
- Track API & EQ Presets
- Account Page
- Audio File Validation
- Artist Page & SEO
- Player Context & Stats
- Shared Playlist API
- Share Target & Tracks Cache
- TypeScript Config
- Playlists Page
- Album Card & Feed
- Desktop Launcher Script
- Admin Badges
- CI & README Overview
- Activity Heatmap
- Activity Feed API
- Radio Station Scheduling
- Dev Tooling Dependencies
- Supabase Migration Script
- Account Asset Routes
- Auth Provider & Account Switching
- Search Page
- Audio Visualization Components
- Core Dependencies
- Activity Feed & Artist Client
- Embed Player & Shortcuts
- Reactions & Notifications API
- NPM Scripts
- App Shell & Decorative Effects
- Direct Messages Pages
- Supabase Storage Admin
- Direct Messages API
- Home Page
- Settings Page
- Custom Theme Palette
- Track Play Counter
- Global Chat
- 4G Sharing Script
- Global Chat API
- Launcher Heartbeat
- Upload API & Rate Limiting
- ID3 Tag Parser
- Push Notification Subscriptions
- Dynamic Backdrop Theme
- Top Charts Page
- Cover Scroll Effect Hook
- Radio Live Page
- Cover Accent Color Extraction
- Admin Storage Page
- Root Layout
- UI Sound Effects
- MiniPlayer Decorative Assets
- Sidebar Navigation
- Service Worker / PWA Cache
- Sidebar Decorative Assets
- Device Identification
- Package Metadata
- Playback E2E Test
- Avatar Cropper
- Accent Color Extraction (client)
- Page Transition Animation
- PWA Install Prompt
- Focus Trap Hook
- PWA Icon Assets
- Next.js Config
- Flower Mirror Asset Style
- ESLint Config
- Localtunnel Dependency
- Web Push Types
- PostCSS Config
- Spider Lily Icon Motif
- Cherry Blossom Overlay Asset
- Next.js Branding Asset
- Vercel Boilerplate Asset
- Next.js Default Boilerplate
- Music Cover Placeholder Image
- Apple Touch Icon
- File Icon Asset
- Globe Icon Asset
- Rose Ornament Motif

## God Nodes (most connected - your core abstractions)
1. `usePlayer()` - 60 edges
2. `readAuthenticatedUser()` - 49 edges
3. `getSupabaseAdmin()` - 41 edges
4. `readAccountProfile()` - 35 edges
5. `saveAccountProfile()` - 30 edges
6. `listTracksForApi()` - 22 edges
7. `getPublicProfileHref()` - 21 edges
8. `pushNotification()` - 20 edges
9. `useAuth()` - 19 edges
10. `isValidTrackSrc()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `MiniPlayer()` --references--> `Butterfly.png (decorative asset)`  [EXTRACTED]
  app/MiniPlayer.tsx → public/images/Butterfly.png
- `SharedPlaylistModal()` --calls--> `getPublicProfileHref()`  [EXTRACTED]
  app/SharedPlaylistModal.tsx → lib/publicLinks.ts
- `Sidebar Component (app/Sidebar.tsx)` --references--> `Birds Decorative Asset (birds.png)`  [EXTRACTED]
  app/Sidebar.tsx → public/images/birds.png
- `Sidebar Component (app/Sidebar.tsx)` --references--> `Cherry Blossom Branch Illustration (blossom.png)`  [EXTRACTED]
  app/Sidebar.tsx → public/images/blossom.png
- `AuthProvider()` --calls--> `getSupabaseBrowserAuthClient()`  [EXTRACTED]
  app/AuthProvider.tsx → lib/supabaseAuth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI Pipeline (workflow + jobs)** — _github_workflows_ci_workflow, _github_workflows_ci_lint_and_build, _github_workflows_ci_e2e [EXTRACTED 1.00]
- **Flux de stockage Supabase (mode, config, migration)** — readme_stockage, readme_configuration_supabase, readme_migration_supabase [INFERRED 0.85]
- **Alignement des commandes de test entre README et CI** — readme_tests, _github_workflows_ci_lint_and_build, _github_workflows_ci_e2e [INFERRED 0.85]

## Communities (98 total, 22 thin omitted)

### Community 0 - "Admin Storage API"
Cohesion: 0.06
Nodes (79): GET(), ACCOUNT_DATA_PREFIXES, FileObjectLike, GET(), listAllFiles(), sumSize(), GET(), getErrorMessage() (+71 more)

### Community 1 - "Track Management API & UI"
Cohesion: 0.06
Nodes (53): checkOwnership(), DELETE(), GET(), PUT(), ApiTrack, DeleteTrackResponse, getErrorMessage(), LibraryListRow() (+45 more)

### Community 2 - "Track API & EQ Presets"
Cohesion: 0.07
Nodes (57): DELETE(), extractPublicUrl(), POST(), EQ_PRESETS, GET(), PUT(), serializeTrack(), GET() (+49 more)

### Community 3 - "Account Page"
Cohesion: 0.05
Nodes (44): AccountPage(), AccountResponse, AccountTrack, ACTIVITY_LABELS, ActivityEvent, AVATAR_GRADIENTS, avatarGradient(), DeviceSession (+36 more)

### Community 4 - "Audio File Validation"
Cohesion: 0.10
Nodes (36): AUDIO_EXTENSIONS, AudioExtension, getAudioExtension(), getCoverExtension(), isAcceptedAudioFileName(), isAcceptedAudioUpload(), safeBaseName(), stripAudioExtension() (+28 more)

### Community 5 - "Artist Page & SEO"
Cohesion: 0.10
Nodes (29): GET(), GET(), generateMetadata(), Props, Image(), size, generateMetadata(), Props (+21 more)

### Community 6 - "Player Context & Stats"
Cohesion: 0.10
Nodes (30): AccountResponse, AchievementToast, ApiTrack, clamp(), computeLeaders(), Ctx, DEFAULT_CUSTOM_EQ_GAINS, emptyStats() (+22 more)

### Community 7 - "Shared Playlist API"
Cohesion: 0.15
Nodes (28): Ctx, DELETE(), POST(), Ctx, DELETE(), GET(), isMember(), PATCH() (+20 more)

### Community 8 - "Share Target & Tracks Cache"
Cohesion: 0.10
Nodes (21): ShareTargetPage(), Status, ApiTrack, TracksResponse, dispatchTracksUpdated(), subscribeTracksUpdated(), BatchFile, BatchStatus (+13 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.06
Nodes (30): ./*, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+22 more)

### Community 10 - "Playlists Page"
Cohesion: 0.10
Nodes (21): badgeToneClass(), DynamicPlaylist, getErrorMessage(), Playlist, PlaylistBadge, PlaylistsPage(), TrackWithCover, uid() (+13 more)

### Community 11 - "Album Card & Feed"
Cohesion: 0.12
Nodes (17): AlbumCard(), AlbumCardProps, FavoriteRow(), FeedPage(), FeedRow(), FeedTrack, PlayerTrack, Track (+9 more)

### Community 12 - "Desktop Launcher Script"
Cohesion: 0.13
Nodes (18): Ensure-Dependencies(), Find-FreePort(), Get-AppRootFromNextCliPath(), Get-AppRootFromProcessId(), Get-LatestInputTimestamp(), Get-ListenerProcessId(), Get-LogTail(), Invoke-NpmRedirected() (+10 more)

### Community 13 - "Admin Badges"
Cohesion: 0.19
Nodes (18): AdminBadgesPage(), Assignments, getErrorMessage(), GET(), PUT(), ADMIN_USER_IDS, isAdminUser(), BADGE_KEYS (+10 more)

### Community 14 - "CI & README Overview"
Cohesion: 0.12
Nodes (22): e2e Job, lint-and-build Job, CI Workflow, Admin (gestion des badges), Administration (/admin/badges, ADMIN_USER_IDS), Lancement type app de bureau (app:launch/app:stop/app:package), Bibliotheque (upload, recherche, artistes, Top), Configuration Supabase (+14 more)

### Community 15 - "Activity Heatmap"
Cohesion: 0.13
Nodes (16): ActivityHeatmap(), ActivityHeatmapProps, Cell, LEVEL_COLORS, levelForCount(), MONTH_LABELS, toDayKey(), PlayerStats (+8 more)

### Community 16 - "Activity Feed API"
Cohesion: 0.20
Nodes (17): CLIENT_REPORTABLE, GET(), POST(), DELETE(), GET(), POST(), ActivityEvent, ActivityEventType (+9 more)

### Community 17 - "Radio Station Scheduling"
Cohesion: 0.18
Nodes (19): GET(), buildSchedule(), getDayEpoch(), getDayKey(), getPath(), getRadioNowPlaying(), getRadioSchedule(), mapWithConcurrency() (+11 more)

### Community 18 - "Dev Tooling Dependencies"
Cohesion: 0.10
Nodes (21): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 19 - "Supabase Migration Script"
Cohesion: 0.20
Nodes (20): dedupeTracks(), defaultTitleFromBase(), ensureBucketReady(), findCoverForBase(), force, getMetaForFile(), getPublicUrl(), hasErrorMessage() (+12 more)

### Community 20 - "Account Asset Routes"
Cohesion: 0.27
Nodes (16): DELETE(), GET(), getPath(), POST(), GET(), getPath(), PUT(), DELETE() (+8 more)

### Community 21 - "Auth Provider & Account Switching"
Cohesion: 0.22
Nodes (16): AuthContext, AuthContextValue, AuthProvider(), getStoredAccount(), isStoredAccount(), listStoredAccounts(), readAll(), removeStoredAccount() (+8 more)

### Community 22 - "Search Page"
Cohesion: 0.15
Nodes (17): ArtistCard(), ArtistEntry, ArtistRow(), escapeRegExp(), fuzzyMatch(), getErrorMessage(), HighlightedText(), levenshtein() (+9 more)

### Community 23 - "Audio Visualization Components"
Cohesion: 0.21
Nodes (15): AudioBars(), clamp01(), mix(), Props, AudioEqualizer(), clamp01(), Props, ensureConnected() (+7 more)

### Community 24 - "Core Dependencies"
Cohesion: 0.11
Nodes (19): @breezystack/lamejs, lucide-react, music-metadata, next, dependencies, @breezystack/lamejs, lucide-react, music-metadata (+11 more)

### Community 25 - "Activity Feed & Artist Client"
Cohesion: 0.14
Nodes (14): ActivityEvent, ActivityFeed(), formatRelativeTime(), ArtistClient(), ArtistData, ArtistOwner, ArtistResponse, ArtistTrack (+6 more)

### Community 26 - "Embed Player & Shortcuts"
Cohesion: 0.16
Nodes (11): EmbedPlayer(), formatTime(), FavoritesPage(), KeyboardShortcuts(), SHORTCUTS, MiniPlayer(), withAlpha(), usePlayer() (+3 more)

### Community 27 - "Reactions & Notifications API"
Cohesion: 0.26
Nodes (12): GET(), PUT(), POST(), ALLOWED_EMOJIS, lastReactionAtByUser, POST(), AppNotification, getNotifPath() (+4 more)

### Community 28 - "NPM Scripts"
Cohesion: 0.12
Nodes (16): scripts, app:launch, app:package, app:stop, build, dev, lint, share:4g (+8 more)

### Community 29 - "App Shell & Decorative Effects"
Cohesion: 0.18
Nodes (7): CustomCursor(), FallingPetals(), seededRandom(), isActivePath(), MobileTabBar(), tabs, AppNotification

### Community 30 - "Direct Messages Pages"
Cohesion: 0.28
Nodes (13): useAuth(), ConversationPreview, formatRelative(), MessagesInboxPage(), ConversationPage(), DirectMessage, formatTime(), PublicProfile (+5 more)

### Community 31 - "Supabase Storage Admin"
Cohesion: 0.24
Nodes (12): DELETE(), extractPublicUrl(), POST(), BucketOptions, ensureSupabaseBucketReady(), ensureSupabaseBucketWithOptions(), hasErrorMessage(), isAlreadyExistsError() (+4 more)

### Community 32 - "Direct Messages API"
Cohesion: 0.32
Nodes (11): GET(), Ctx, GET(), POST(), appendMessage(), DirectMessage, getConversationId(), getConversationPath() (+3 more)

### Community 33 - "Home Page"
Cohesion: 0.22
Nodes (11): ApiTrack, getCoverDedupKey(), getErrorMessage(), getTodayMoment(), Home(), RecentCard, TodayMoment, todayMomentLabel() (+3 more)

### Community 34 - "Settings Page"
Cohesion: 0.15
Nodes (4): EqGains, COLOR_THEME_OPTIONS, EQ_BAND_LABELS, SettingsContent()

### Community 35 - "Custom Theme Palette"
Cohesion: 0.31
Nodes (11): applyCustomThemeToDom(), clampByte(), clearCustomThemeFromDom(), computeCustomThemeRgbPalette(), computeCustomThemeVars(), CUSTOM_THEME_CSS_VARS, hslToRgb(), normalizeHue() (+3 more)

### Community 36 - "Track Play Counter"
Cohesion: 0.32
Nodes (10): GET(), getPath(), PUT(), bumpTrackPlaysAndNotify(), getPath(), MILESTONES, normalize(), readTrackPlays() (+2 more)

### Community 37 - "Global Chat"
Cohesion: 0.26
Nodes (11): ConversationPreview, formatRelative(), formatTime(), GlobalChat(), groupMessages(), HUE_PALETTE, initials(), MessageGroup (+3 more)

### Community 38 - "4G Sharing Script"
Cohesion: 0.29
Nodes (11): args, cleanup(), getPublicIp(), isReachable(), main(), port, prefixPipe(), runCommand() (+3 more)

### Community 39 - "Global Chat API"
Cohesion: 0.36
Nodes (9): ChatMessage, DELETE(), GET(), lastMessageAtByUser, POST(), readHistory(), resolveMentions(), saveHistory() (+1 more)

### Community 40 - "Launcher Heartbeat"
Cohesion: 0.29
Nodes (7): POST(), register(), getState(), globalState, LauncherHeartbeatState, recordHeartbeat(), startLauncherWatchdog()

### Community 41 - "Upload API & Rate Limiting"
Cohesion: 0.31
Nodes (8): getErrorMessage(), POST(), createUploadTargetsForApi(), isValidAudioFileName(), Bucket, buckets, checkRateLimit(), RateLimitResult

### Community 42 - "ID3 Tag Parser"
Cohesion: 0.31
Nodes (9): decodeText(), extensionForMimeType(), findNullTerminator(), Id3Picture, Id3Tags, parsePictureFrame(), pictureToFile(), readId3Tags() (+1 more)

### Community 43 - "Push Notification Subscriptions"
Cohesion: 0.44
Nodes (9): addPushSubscription(), getPushSubscriptions(), getSubscriptionsPath(), getVapidConfig(), isValidSubscription(), removePushSubscription(), sendPushToUser(), StoredPushSubscription (+1 more)

### Community 44 - "Dynamic Backdrop Theme"
Cohesion: 0.33
Nodes (8): BackdropPalette, clampByte(), DynamicBackdrop(), mixRgb(), PALETTES, Rgb, rgbToCss(), ColorTheme

### Community 45 - "Top Charts Page"
Cohesion: 0.25
Nodes (8): formatListenTime(), ListenerEntry, MAIN_TABS, MainTab, Period, PERIOD_TABS, TopEntry, TopPage()

### Community 46 - "Cover Scroll Effect Hook"
Cohesion: 0.44
Nodes (8): buildCoverScrollTransform(), clamp01(), EdgeSide, getEdgeBlurState(), getViewportBounds(), isWindowTarget(), ScrollTarget, useCoverScrollEffect()

### Community 47 - "Radio Live Page"
Cohesion: 0.36
Nodes (6): formatDayKey(), formatEta(), formatTime(), RadioLivePage(), RadioLiveResponse, RadioTrackData

### Community 48 - "Cover Accent Color Extraction"
Cohesion: 0.43
Nodes (6): accentFromCover(), accentFromText(), AccentRGB, clamp(), hashString(), hslToRgb()

### Community 49 - "Admin Storage Page"
Cohesion: 0.38
Nodes (5): AdminStoragePage(), formatBytes(), getErrorMessage(), StorageResponse, TopUser

### Community 50 - "Root Layout"
Cohesion: 0.29
Nodes (5): AppShell(), geistMono, geistSans, metadata, viewport

### Community 51 - "UI Sound Effects"
Cohesion: 0.60
Nodes (5): getContext(), playChimeSound(), playPopSound(), playTone(), unlockAudio()

### Community 52 - "MiniPlayer Decorative Assets"
Cohesion: 0.50
Nodes (5): MiniPlayer Component, UI Decorative Asset Pattern, Kanji Decorative Image Asset, Ornament Decorative Image Asset (base), Ornament Strip Decorative Image Asset

### Community 53 - "Sidebar Navigation"
Cohesion: 0.50
Nodes (3): isActivePath(), nav, Sidebar()

### Community 55 - "Sidebar Decorative Assets"
Cohesion: 0.50
Nodes (4): Sidebar Component (app/Sidebar.tsx), Birds Decorative Asset (birds.png), Cherry Blossom Branch Illustration (blossom.png), Flower Mirror Decorative Asset (flower miror.png)

### Community 57 - "Package Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 60 - "Playback E2E Test"
Cohesion: 0.50
Nodes (3): audioDir, fixtureSrc, testFilePath

### Community 67 - "PWA Icon Assets"
Cohesion: 0.67
Nodes (3): PWA Web App Manifest Icon Set, App Icon (512x512), Black and White Spider Lily Flowers Photograph

### Community 69 - "Flower Mirror Asset Style"
Cohesion: 0.67
Nodes (3): UI Decorative Asset, flower miror.png (decorative flower illustration), Pale Ink-Wash / Line-Art Botanical Style

## Knowledge Gaps
- **323 isolated node(s):** `ActivityHeatmapProps`, `Cell`, `MONTH_LABELS`, `LEVEL_COLORS`, `AlbumCardProps` (+318 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayer()` connect `Embed Player & Shortcuts` to `Track Management API & UI`, `Home Page`, `Account Page`, `Settings Page`, `Global Chat`, `Player Context & Stats`, `Playlists Page`, `Album Card & Feed`, `Dynamic Backdrop Theme`, `Top Charts Page`, `Radio Live Page`, `Activity Heatmap`, `Root Layout`, `Sidebar Navigation`, `Search Page`, `Audio Visualization Components`, `Activity Feed & Artist Client`, `App Shell & Decorative Effects`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `readAccountProfile()` connect `Track API & EQ Presets` to `Direct Messages API`, `Admin Storage API`, `Track Management API & UI`, `Artist Page & SEO`, `Shared Playlist API`, `Global Chat API`, `Reactions & Notifications API`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `readAuthenticatedUser()` connect `Account Asset Routes` to `Admin Storage API`, `Direct Messages API`, `Global Chat API`, `Upload API & Rate Limiting`, `Admin Badges`, `Activity Feed API`, `Reactions & Notifications API`, `Supabase Storage Admin`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `ActivityHeatmapProps`, `Cell`, `MONTH_LABELS` to the rest of the system?**
  _324 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Storage API` be split into smaller, more focused modules?**
  _Cohesion score 0.05733397037744864 - nodes in this community are weakly interconnected._
- **Should `Track Management API & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.058173076923076925 - nodes in this community are weakly interconnected._
- **Should `Track API & EQ Presets` be split into smaller, more focused modules?**
  _Cohesion score 0.0742447516641065 - nodes in this community are weakly interconnected._