# MP3 Web

Application Next.js pour lire, uploader et organiser une bibliotheque MP3, avec playlists, favoris, radio en direct et un volet social (feed, messages, notifications).

## Fonctionnalites

- **Bibliotheque**: upload, recherche, artistes, page "Top"
- **Playlists**: creation/renommage, playlists dynamiques (decouvertes, top de la semaine...), pochettes en collage, reordonnancement par glisser-deposer
- **Favoris**, historique et statistiques d'ecoute (page Stats + recap "Wrapped")
- **Radio en direct**: file d'attente partagee entre utilisateurs
- **Social**: feed, messages prives, chat global, notifications push
- **Partage**: liens d'integration (`/embed`), cible de partage PWA (`/share-target`)
- **PWA**: installable, fonctionne hors-ligne pour les morceaux mis en cache
- **Admin**: gestion des badges (`/admin`, reserve aux IDs listes dans `ADMIN_USER_IDS`)

## Utiliser l'app

Rends-toi sur **https://mp3-web-bnp9.vercel.app** - rien a installer, rien a lancer.

## Developpement local

```bash
npm install
npm run dev
```

Ensuite ouvre `http://localhost:3000`.

Pour lancer l'app en local comme une application de bureau (build + serveur geres automatiquement):

```bash
npm run app:launch   # build si besoin, demarre le serveur, ouvre le navigateur
npm run app:stop     # arrete le serveur local
npm run app:package  # prepare les raccourcis/launchers
```

`MP3_WEB_AUTO_SHUTDOWN=1` (dans `.env.local`) arrete automatiquement le serveur quand plus aucun client n'est actif.

## Stockage

L'app sait fonctionner de 3 facons pour les fichiers media (mp3/covers/avatars/bannieres):

- mode local: les nouveaux fichiers vont dans `public/audio` et `public/cover`
- mode Supabase (legacy): les nouveaux fichiers vont dans un bucket Storage Supabase
- mode R2 (recommande): les nouveaux fichiers vont dans un bucket Cloudflare R2

Priorite actuelle:

1. R2 si configure
2. sinon Supabase si configure
3. sinon local

Les donnees de compte (playlists, favoris, badges, messages, activite...) restent toujours sur Supabase Storage (bucket prive `account-data`), quel que soit le backend media choisi.

Si aucun backend cloud n'est configure, l'app continue de fonctionner en local.

## Configuration Supabase

C'est le mode cloud le plus simple de cette app car il ne demande pas de table SQL.

1. Cree un projet Supabase.
2. Recupere `Project URL` ainsi que les cles `service_role` et `anon`/`publishable` dans `Settings > API`.
3. Copie `.env.example` vers `.env.local`.
4. Renseigne au minimum:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_STORAGE_BUCKET=media
```

Les cles `NEXT_PUBLIC_*` sont exposees au navigateur et necessaires pour l'authentification et le temps reel; `SUPABASE_SERVICE_ROLE_KEY` reste uniquement cote serveur.

Le bucket public sera prepare automatiquement au premier upload.

L'app y stocke:

- les MP3 dans `audio/`
- les covers dans `cover/`
- le catalogue partage dans `catalog/tracks.json` (chemin configurable via `SUPABASE_CATALOG_PATH`)
- les donnees de compte (playlists, favoris, badges...) dans le bucket prive `SUPABASE_ACCOUNT_BUCKET` (par defaut `account-data`)

Une fois ces variables presentes, les nouveaux uploads et comptes passent automatiquement sur Supabase.

## Migrer la bibliotheque locale vers Supabase

Si tu as deja des morceaux dans `public/audio` et `public/cover`, tu peux les envoyer vers Supabase:

```bash
npm run supabase:migrate
```

Pour re-uploader des fichiers deja presents:

```bash
npm run supabase:migrate -- --force
```

## Configuration Cloudflare R2 (recommande si le quota Supabase Storage est atteint)

R2 est S3-compatible, propose 10 Go gratuits et surtout **l'egress gratuit** (important pour du streaming audio). Supabase reste utilise pour l'auth et les donnees de compte (`account-data`) - seuls les mp3/covers/avatars/bannieres basculent sur R2.

1. Cree/utilise un compte Cloudflare et active R2 (une carte bancaire est generalement demandee meme pour le palier gratuit).
2. Cree un bucket (ex. `mp3-web-media`).
3. Active l'acces public: Bucket > Settings > Public Access > active le sous-domaine `r2.dev`. Tu obtiens une URL du type `https://pub-xxxxxxxxxxxxxxxxxxxx.r2.dev` (un domaine personnalise peut etre branche plus tard sans changement de code).
4. Cree un token API R2 (R2 > Manage R2 API Tokens > Create API Token, permission "Object Read & Write", restreint si possible a ce bucket) - recupere l'Access Key ID, le Secret Access Key et l'Account ID.
5. Renseigne dans `.env.local`:

```env
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=media
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxxxxxxxxxxxxxx.r2.dev
```

Une fois ces variables presentes, les nouveaux uploads (morceaux, avatars, bannieres) passent automatiquement sur R2.

### Migrer les fichiers existants de Supabase vers R2

Si tu as deja des morceaux/avatars/bannieres sur Supabase Storage:

```bash
npm run r2:migrate            # dry-run: affiche ce qui serait copie, n'ecrit rien
npm run r2:migrate -- --execute   # copie reellement les fichiers vers R2 et reecrit le catalogue
```

Ce script ne supprime jamais rien cote Supabase. Il ecrit aussi `r2-migration-map.json` a la racine du projet, qui sert d'entree au script suivant.

Les URLs des morceaux servant aussi de cle d'identite pour les favoris/playlists/epingles/anthem/commentaires/paroles/compteurs d'ecoute (stockes cote `account-data`), lance ensuite:

```bash
npm run r2:migrate-refs            # dry-run
npm run r2:migrate-refs -- --execute   # reecrit ces references pour pointer vers les nouvelles URLs R2
```

Sans cette 2e etape, les morceaux migres restent lisibles mais perdent leurs favoris/playlists/commentaires/paroles/compteurs existants.

Une fois la migration validee (morceaux, covers, avatars, bannieres, references account-data tous verifies en conditions reelles), le nettoyage des fichiers Supabase devenus inutiles reste une action **manuelle**, a faire depuis le dashboard Supabase - aucun script de ce projet ne supprime automatiquement quoi que ce soit cote Supabase.

## Notifications push (optionnel)

Pour activer les notifications push (nouveau follower, nouvel upload), genere une paire de cles VAPID et ajoute-les a `.env.local` :

```bash
npx web-push generate-vapid-keys --json
```

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Sans ces variables, l'app fonctionne normalement, simplement sans notifications push.

## Administration (optionnel)

`/admin/badges` permet d'attribuer des badges aux comptes. L'acces est reserve aux IDs (UUID Supabase) listes dans `ADMIN_USER_IDS` (separes par des virgules). Sans cette variable, un ID admin par defaut est utilise.

## Partager sur le reseau local / 4G (optionnel)

```bash
npm run share:4g       # build de dev + tunnel public via localtunnel
npm run share:4g:prod  # idem en mode production
```

Configurable via `PORT`, `HOST` et `TUNNEL_SUBDOMAIN` dans `.env.local`.

## Tests

```bash
npm run lint            # ESLint
npm run test:e2e        # tests Playwright (npm run test:e2e:install au prealable)
npm run test:e2e:headed # idem, navigateur visible
```

## Notes utiles

- Les uploads restent limites a `80 MB` par piste dans l'API actuelle.
- Les playlists et favoris sont synchronises par compte des qu'un backend cloud est configure (sinon ils restent locaux au navigateur).
- Les morceaux et covers deviennent partages entre utilisateurs des que l'app pointe vers le meme projet cloud.
