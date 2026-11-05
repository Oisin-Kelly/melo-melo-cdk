// The app's theme: the pre-built MeloMelo theme (neutral + logo-teal accent). Built
// artifacts avoid Astryx's runtime style injection. Source: src/themes/melomelo.ts —
// after editing it, run `npm run theme:build` to regenerate src/themes/built/.
import '@/themes/built/melomelo.css'
export { melomeloTheme as brandTheme } from '@/themes/built/melomelo'
