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

L'app sait fonctionner de 2 facons:

- mode local: les nouveaux fichiers vont dans `public/audio` et `public/cover`
- mode Supabase: les nouveaux fichiers vont dans un bucket Storage partage

Priorite actuelle:

1. Supabase si configure
2. sinon local

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
