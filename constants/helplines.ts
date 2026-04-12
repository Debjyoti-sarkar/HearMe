/** Curated India helplines — verify numbers for your state before production. */
export type Helpline = {
  id: string;
  title: string;
  subtitle: string;
  number: string;
};

export const INDIA_HELPLINES: Helpline[] = [
  {
    id: '112',
    title: 'National emergency',
    subtitle: 'Police / fire / medical (NERS in many states)',
    number: '112',
  },
  {
    id: '1091',
    title: 'Women helpline',
    subtitle: 'National Commission for Women — 24×7',
    number: '1091',
  },
  {
    id: '181',
    title: 'Women distress (some states)',
    subtitle: 'Check local availability; use 1091 if unsure',
    number: '181',
  },
  {
    id: '139',
    title: 'Railway security',
    subtitle: 'RPF / security on trains & stations',
    number: '139',
  },
  {
    id: '1075',
    title: 'NDMA disaster',
    subtitle: 'National Disaster Management Authority',
    number: '1075',
  },
  {
    id: '1930',
    title: 'Cyber fraud reporting',
    subtitle: 'National cybercrime helpline',
    number: '1930',
  },
];
