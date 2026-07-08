// Contenu du module « Travailler une qualité » : méthodes d'entraînement par filière
// au-delà de la seule PMA, outils de mesure, objectifs, erreurs fréquentes et semaine type.
// Bilingue (fr / es). Source pédagogique : synthèse de méthodologie de l'entraînement
// (filières énergétiques : Wilmore & Costill ; intervalles : Billat ; tests terrain : 30-15 IFT Buchheit).

export type BiText = { fr: string; es: string };
export function bi(t: BiText, lang: string): string { return lang === "es" ? t.es : t.fr; }

export type MethodRow = { fil: BiText; obj: BiText; meth: BiText; ex: BiText; intensite: BiText; recup: BiText };
export const TRAINING_METHODS: MethodRow[] = [
  { fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"}, obj:{fr:"Explosivité, vitesse, puissance courte",es:"Explosividad, velocidad, potencia corta"}, meth:{fr:"Sprints très courts, départs arrêtés, pliométrie, sauts, lancers, muscu explosive",es:"Sprints muy cortos, salidas paradas, pliometría, saltos, lanzamientos, fuerza explosiva"}, ex:{fr:"8 × 10 m sprint départ arrêté",es:"8 × 10 m sprint salida parada"}, intensite:{fr:"Très explosif, effort de 1 à 7 s",es:"Muy explosivo, esfuerzo de 1 a 7 s"}, recup:{fr:"Longue : 1 à 3 min",es:"Larga: 1 a 3 min"} },
  { fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"}, obj:{fr:"Répéter des efforts explosifs",es:"Repetir esfuerzos explosivos"}, meth:{fr:"Sprints répétés avec récupération complète",es:"Sprints repetidos con recuperación completa"}, ex:{fr:"6 × 20 m à fond",es:"6 × 20 m a tope"}, intensite:{fr:"95-100 %, sans perte de vitesse",es:"95-100 %, sin pérdida de velocidad"}, recup:{fr:"2 à 4 min",es:"2 a 4 min"} },
  { fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"}, obj:{fr:"Puissance neuromusculaire",es:"Potencia neuromuscular"}, meth:{fr:"Muscu lourde explosive",es:"Fuerza pesada explosiva"}, ex:{fr:"5 × 3 reps squat ou trap bar à charge lourde",es:"5 × 3 reps sentadilla o trap bar con carga pesada"}, intensite:{fr:"Très intense mais très court",es:"Muy intenso pero muy corto"}, recup:{fr:"2 à 4 min",es:"2 a 4 min"} },
  { fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"}, obj:{fr:"Tolérance à l'acide lactique",es:"Tolerancia al ácido láctico"}, meth:{fr:"Intervalles courts intenses",es:"Intervalos cortos intensos"}, ex:{fr:"8 × 30 s très vite / 30 s repos",es:"8 × 30 s muy rápido / 30 s descanso"}, intensite:{fr:"Très dur, brûlure musculaire",es:"Muy duro, ardor muscular"}, recup:{fr:"Incomplète",es:"Incompleta"} },
  { fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"}, obj:{fr:"Capacité à tenir un effort violent",es:"Capacidad de mantener un esfuerzo violento"}, meth:{fr:"Intervalles moyens",es:"Intervalos medios"}, ex:{fr:"5 × 1 min très intense / 2 min repos",es:"5 × 1 min muy intenso / 2 min descanso"}, intensite:{fr:"90-95 %, difficile",es:"90-95 %, difícil"}, recup:{fr:"2 min",es:"2 min"} },
  { fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"}, obj:{fr:"Résister à la fatigue en combat / sport co",es:"Resistir la fatiga en combate / deporte de equipo"}, meth:{fr:"Circuits type HIIT",es:"Circuitos tipo HIIT"}, ex:{fr:"4 tours : 30 s burpees, 30 s corde, 30 s frappes, 30 s repos",es:"4 vueltas: 30 s burpees, 30 s comba, 30 s golpeo, 30 s descanso"}, intensite:{fr:"Très dur",es:"Muy duro"}, recup:{fr:"Courte",es:"Corta"} },
  { fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"}, obj:{fr:"Finir fort malgré la fatigue",es:"Terminar fuerte a pesar de la fatiga"}, meth:{fr:"Efforts longs à haute intensité",es:"Esfuerzos largos de alta intensidad"}, ex:{fr:"3 × 2 min très intense / 3 min repos",es:"3 × 2 min muy intenso / 3 min descanso"}, intensite:{fr:"Proche compétition",es:"Cerca de competición"}, recup:{fr:"3 min",es:"3 min"} },
  { fil:{fr:"Aérobie basse intensité",es:"Aeróbica baja intensidad"}, obj:{fr:"Base cardio, récupération, endurance générale",es:"Base cardio, recuperación, resistencia general"}, meth:{fr:"Endurance fondamentale",es:"Resistencia de base"}, ex:{fr:"45 min footing facile",es:"45 min trote fácil"}, intensite:{fr:"Facile, tu peux parler",es:"Fácil, puedes hablar"}, recup:{fr:"Continue",es:"Continua"} },
  { fil:{fr:"Aérobie basse intensité",es:"Aeróbica baja intensidad"}, obj:{fr:"Augmenter le volume sans trop fatiguer",es:"Aumentar el volumen sin fatigarse demasiado"}, meth:{fr:"Vélo, rameur, natation, marche rapide",es:"Bici, remo, natación, marcha rápida"}, ex:{fr:"60 min vélo tranquille",es:"60 min bici tranquila"}, intensite:{fr:"60-70 % FC max",es:"60-70 % FC máx"}, recup:{fr:"Continue",es:"Continua"} },
  { fil:{fr:"Aérobie moyenne intensité",es:"Aeróbica media intensidad"}, obj:{fr:"Améliorer le rythme durable",es:"Mejorar el ritmo sostenible"}, meth:{fr:"Tempo run / allure soutenue",es:"Tempo run / ritmo sostenido"}, ex:{fr:"3 × 10 min soutenu / 3 min lent",es:"3 × 10 min sostenido / 3 min lento"}, intensite:{fr:"Dur mais contrôlé",es:"Duro pero controlado"}, recup:{fr:"Courte",es:"Corta"} },
  { fil:{fr:"Seuil aérobie / anaérobie",es:"Umbral aeróbico / anaeróbico"}, obj:{fr:"Tenir une intensité élevée longtemps",es:"Mantener una intensidad alta mucho tiempo"}, meth:{fr:"Travail au seuil",es:"Trabajo en umbral"}, ex:{fr:"4 × 6 min au seuil / 2 min repos",es:"4 × 6 min en umbral / 2 min descanso"}, intensite:{fr:"80-90 %, respiration forte",es:"80-90 %, respiración fuerte"}, recup:{fr:"2 min",es:"2 min"} },
  { fil:{fr:"Aérobie haute intensité",es:"Aeróbica alta intensidad"}, obj:{fr:"Améliorer le cardio intense (pas que la PMA)",es:"Mejorar el cardio intenso (no solo la PAM)"}, meth:{fr:"Intervalles longs",es:"Intervalos largos"}, ex:{fr:"5 × 3 min vite / 2 min lent",es:"5 × 3 min rápido / 2 min lento"}, intensite:{fr:"Très dur mais tenable",es:"Muy duro pero mantenible"}, recup:{fr:"2 min",es:"2 min"} },
  { fil:{fr:"Aérobie haute intensité",es:"Aeróbica alta intensidad"}, obj:{fr:"Répéter des efforts à haute intensité",es:"Repetir esfuerzos de alta intensidad"}, meth:{fr:"Intermittent",es:"Intermitente"}, ex:{fr:"2 blocs de 10 × 15 s vite / 15 s lent",es:"2 bloques de 10 × 15 s rápido / 15 s lento"}, intensite:{fr:"Rapide, mais propre",es:"Rápido pero limpio"}, recup:{fr:"3 min entre blocs",es:"3 min entre bloques"} },
  { fil:{fr:"Mixte aérobie + lactique",es:"Mixta aeróbica + láctica"}, obj:{fr:"Sports de combat, foot, basket, rugby",es:"Deportes de combate, fútbol, baloncesto, rugby"}, meth:{fr:"Intervalles spécifiques",es:"Intervalos específicos"}, ex:{fr:"5 × 3 min type round / 1 min repos",es:"5 × 3 min tipo round / 1 min descanso"}, intensite:{fr:"Intensité compétition",es:"Intensidad competición"}, recup:{fr:"1 min",es:"1 min"} },
  { fil:{fr:"Mixte explosif + cardio",es:"Mixta explosiva + cardio"}, obj:{fr:"Répéter l'explosivité sous fatigue",es:"Repetir la explosividad bajo fatiga"}, meth:{fr:"Complexes muscu / cardio",es:"Complejos fuerza / cardio"}, ex:{fr:"5 tours : 5 sauts + 10 s sprint + 40 s récup",es:"5 vueltas: 5 saltos + 10 s sprint + 40 s recup"}, intensite:{fr:"Explosif puis essoufflé",es:"Explosivo y luego sin aliento"}, recup:{fr:"40 s à 2 min",es:"40 s a 2 min"} },
  { fil:{fr:"Récupération active",es:"Recuperación activa"}, obj:{fr:"Améliorer la capacité à récupérer entre efforts",es:"Mejorar la capacidad de recuperar entre esfuerzos"}, meth:{fr:"Footing très lent, vélo facile, mobilité",es:"Trote muy lento, bici fácil, movilidad"}, ex:{fr:"25-40 min très facile",es:"25-40 min muy fácil"}, intensite:{fr:"Très facile",es:"Muy fácil"}, recup:{fr:"Continue",es:"Continua"} },
  { fil:{fr:"Spécifique sport",es:"Específico del deporte"}, obj:{fr:"Transférer au geste sportif",es:"Transferir al gesto deportivo"}, meth:{fr:"Rounds, jeux réduits, assauts, shadow, fractionné technique",es:"Rounds, juegos reducidos, asaltos, shadow, fraccionado técnico"}, ex:{fr:"6 × 2 min shadow intense / 1 min repos",es:"6 × 2 min shadow intenso / 1 min descanso"}, intensite:{fr:"Proche du sport réel",es:"Cerca del deporte real"}, recup:{fr:"Comme en compétition",es:"Como en competición"} },
];

export type ToolRow = { tool: BiText; repl: BiText; use: BiText };
export const MEASURE_TOOLS: ToolRow[] = [
  { tool:{fr:"VMA",es:"VAM"}, repl:{fr:"Alternative proche de la PMA mais en vitesse de course",es:"Alternativa cercana a la PAM pero en velocidad de carrera"}, use:{fr:"Course à pied, sports co",es:"Carrera, deportes de equipo"} },
  { tool:{fr:"FC max / zones cardio",es:"FC máx / zonas cardio"}, repl:{fr:"Travail par fréquence cardiaque",es:"Trabajo por frecuencia cardíaca"}, use:{fr:"Endurance, seuil, récupération",es:"Resistencia, umbral, recuperación"} },
  { tool:{fr:"RPE / ressenti de 1 à 10",es:"RPE / percepción de 1 a 10"}, repl:{fr:"Simple si tu n'as pas de capteur",es:"Sencillo si no tienes sensor"}, use:{fr:"Tous sports",es:"Todos los deportes"} },
  { tool:{fr:"Allure spécifique compétition",es:"Ritmo específico de competición"}, repl:{fr:"Plus concret que la PMA",es:"Más concreto que la PAM"}, use:{fr:"Combat, course, sports co",es:"Combate, carrera, deportes de equipo"} },
  { tool:{fr:"Temps d'effort / temps de repos",es:"Tiempo de esfuerzo / tiempo de descanso"}, repl:{fr:"Très pratique pour cibler une filière",es:"Muy práctico para apuntar a una vía"}, use:{fr:"HIIT, fractionné, rounds",es:"HIIT, fraccionado, rounds"} },
  { tool:{fr:"Puissance en watts",es:"Potencia en vatios"}, repl:{fr:"Alternative précise à la PMA en vélo / rameur",es:"Alternativa precisa a la PAM en bici / remo"}, use:{fr:"Cyclisme, rameur",es:"Ciclismo, remo"} },
  { tool:{fr:"Lactate sanguin",es:"Lactato en sangre"}, repl:{fr:"Très précis mais moins accessible",es:"Muy preciso pero menos accesible"}, use:{fr:"Seuil, lactique",es:"Umbral, láctico"} },
  { tool:{fr:"Test terrain",es:"Test de campo"}, repl:{fr:"Plus simple que le labo",es:"Más simple que el laboratorio"}, use:{fr:"Cooper, VAMEVAL, Bronco, 30-15 IFT",es:"Cooper, VAMEVAL, Bronco, 30-15 IFT"} },
];

export type GoalIntensity = "facile" | "modere" | "intense";
export type GoalRow = { goal: BiText; fil: BiText; session: BiText; intensity: GoalIntensity; quality: string; durationMin: number };
export const GOAL_SESSIONS: GoalRow[] = [
  { goal:{fr:"Être plus explosif",es:"Ser más explosivo"}, fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"}, session:{fr:"10 × 10 s sprint / 2 min repos",es:"10 × 10 s sprint / 2 min descanso"}, intensity:"intense", quality:"alac", durationMin:40 },
  { goal:{fr:"Tenir des rounds intenses",es:"Aguantar rounds intensos"}, fil:{fr:"Anaérobie lactique + aérobie",es:"Anaeróbica láctica + aeróbica"}, session:{fr:"5 × 3 min intense / 1 min repos",es:"5 × 3 min intenso / 1 min descanso"}, intensity:"intense", quality:"lac", durationMin:45 },
  { goal:{fr:"Mieux récupérer entre les rounds",es:"Recuperar mejor entre rounds"}, fil:{fr:"Aérobie basse + moyenne",es:"Aeróbica baja + media"}, session:{fr:"45 min endurance fondamentale",es:"45 min resistencia de base"}, intensity:"facile", quality:"aero", durationMin:45 },
  { goal:{fr:"Être moins essoufflé",es:"Quedarse menos sin aliento"}, fil:{fr:"Aérobie",es:"Aeróbica"}, session:{fr:"3 × 10 min tempo / 3 min lent",es:"3 × 10 min tempo / 3 min lento"}, intensity:"modere", quality:"aero", durationMin:45 },
  { goal:{fr:"Être plus puissant sous fatigue",es:"Ser más potente bajo fatiga"}, fil:{fr:"Mixte",es:"Mixta"}, session:{fr:"Circuit 30/30 pendant 12 à 20 min",es:"Circuito 30/30 durante 12 a 20 min"}, intensity:"intense", quality:"lac", durationMin:20 },
  { goal:{fr:"Avoir plus de caisse générale",es:"Tener más fondo general"}, fil:{fr:"Aérobie basse",es:"Aeróbica baja"}, session:{fr:"2 sorties faciles de 45 à 60 min / semaine",es:"2 salidas fáciles de 45 a 60 min / semana"}, intensity:"facile", quality:"aero", durationMin:60 },
  { goal:{fr:"Améliorer la tolérance à la brûlure musculaire",es:"Mejorar la tolerancia al ardor muscular"}, fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"}, session:{fr:"6 × 45 s très intense / 2 min repos",es:"6 × 45 s muy intenso / 2 min descanso"}, intensity:"intense", quality:"lac", durationMin:30 },
  { goal:{fr:"Améliorer la vitesse pure",es:"Mejorar la velocidad pura"}, fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"}, session:{fr:"8 × 20 m sprint, récupération complète",es:"8 × 20 m sprint, recuperación completa"}, intensity:"intense", quality:"alac", durationMin:40 },
];

export type MistakeRow = { err: BiText; why: BiText; fix: BiText };
export const COMMON_MISTAKES: MistakeRow[] = [
  { err:{fr:"Faire uniquement du HIIT",es:"Hacer solo HIIT"}, why:{fr:"Fatigue élevée, progression limitée",es:"Fatiga alta, progresión limitada"}, fix:{fr:"Ajouter de l'endurance fondamentale",es:"Añadir resistencia de base"} },
  { err:{fr:"Trop peu récupérer sur les sprints",es:"Recuperar muy poco en los sprints"}, why:{fr:"Tu ne travailles plus la vitesse pure",es:"Ya no trabajas la velocidad pura"}, fix:{fr:"Repos long entre efforts courts",es:"Descanso largo entre esfuerzos cortos"} },
  { err:{fr:"Tout faire à intensité moyenne",es:"Hacerlo todo a intensidad media"}, why:{fr:"Fatigue constante, peu de qualité",es:"Fatiga constante, poca calidad"}, fix:{fr:"Séparer facile / très intense",es:"Separar fácil / muy intenso"} },
  { err:{fr:"Confondre cardio et lactique",es:"Confundir cardio y láctico"}, why:{fr:"Ce ne sont pas les mêmes adaptations",es:"No son las mismas adaptaciones"}, fix:{fr:"Choisir selon durée / intensité",es:"Elegir según duración / intensidad"} },
  { err:{fr:"Copier une séance sans lien avec le sport",es:"Copiar una sesión sin relación con el deporte"}, why:{fr:"Mauvais transfert",es:"Mala transferencia"}, fix:{fr:"Adapter aux durées réelles du sport",es:"Adaptar a las duraciones reales del deporte"} },
  { err:{fr:"Faire du lactique trop souvent",es:"Hacer láctico demasiado a menudo"}, why:{fr:"Très fatigant nerveusement et musculairement",es:"Muy fatigante a nivel nervioso y muscular"}, fix:{fr:"1 fois / semaine suffit souvent",es:"1 vez / semana suele bastar"} },
];

// Contribution des filières à la production d'ATP selon la distance de course
// (Newsholme et al. 1992). (*) : la PCr est utilisée dans les premières secondes.
export type ContribRow = { dist: string; pcr: string; ana: string; aero: string; note: BiText };
export const ENERGY_CONTRIB: ContribRow[] = [
  { dist:"100 m", pcr:"48 %", ana:"48 %", aero:"4 %", note:{fr:"",es:""} },
  { dist:"200 m", pcr:"25 %", ana:"65 %", aero:"10 %", note:{fr:"",es:""} },
  { dist:"400 m", pcr:"12,5 %", ana:"62,5 %", aero:"25 %", note:{fr:"",es:""} },
  { dist:"800 m", pcr:"6 %", ana:"50 %", aero:"44 %", note:{fr:"",es:""} },
  { dist:"1500 m", pcr:"(*)", ana:"25 %", aero:"75 %", note:{fr:"",es:""} },
  { dist:"5000 m", pcr:"(*)", ana:"12,5 %", aero:"87,5 %", note:{fr:"",es:""} },
  { dist:"10 000 m", pcr:"(*)", ana:"3 %", aero:"97 %", note:{fr:"",es:""} },
  { dist:"Marathon", pcr:"(*)", ana:"1 %", aero:"74 %", note:{fr:"+ 5 % glucose, + 20 % lipides",es:"+ 5 % glucosa, + 20 % lípidos"} },
  { dist:"80 km", pcr:"(*)", ana:"—", aero:"35 %", note:{fr:"+ 5 % glucose, + 60 % lipides, + AA ramifiés",es:"+ 5 % glucosa, + 60 % lípidos, + AA ramificados"} },
];

// Cinétique de récupération des filières (resynthèse / élimination).
export const ENERGY_RECOVERY: BiText[] = [
  { fr:"PCr (phosphocréatine) : 70 % refaite en 50 s, 84 % en 2 min, ~100 % en 6-8 min. C'est pourquoi les sprints demandent 2-3 min de repos.", es:"PCr (fosfocreatina): 70 % rehecha en 50 s, 84 % en 2 min, ~100 % en 6-8 min. Por eso los sprints necesitan 2-3 min de descanso." },
  { fr:"Lactate, récupération passive (assis) : 50 % éliminé en 25 min, 100 % en 1 h 30.", es:"Lactato, recuperación pasiva (sentado): 50 % eliminado en 25 min, 100 % en 1 h 30." },
  { fr:"Lactate, récupération active (footing / vélo léger à 40-60 % VAM) : 50 % en 6 min, 100 % en 20 min → bouger l'élimine bien plus vite.", es:"Lactato, recuperación activa (trote / bici suave al 40-60 % VAM): 50 % en 6 min, 100 % en 20 min → moverse lo elimina mucho más rápido." },
  { fr:"Glycogène : vidé en ~1 h à 80-85 % VAM ; 50 % refait dès la 5e heure, complet en 12 à 46 h selon l'apport en glucides.", es:"Glucógeno: agotado en ~1 h al 80-85 % VAM; 50 % rehecho ya en la 5.ª hora, completo en 12 a 46 h según el aporte de carbohidratos." },
];

// Principes clés issus de la bioénergétique.
export const ENERGY_PRINCIPLES: BiText[] = [
  { fr:"Développe d'abord ta base aérobie : elle accélère la resynthèse de la PCr entre les sprints, donc plus de vitesse et de puissance ensuite.", es:"Desarrolla primero tu base aeróbica: acelera la resíntesis de la PCr entre sprints, y por tanto más velocidad y potencia después." },
  { fr:"La récupération active élimine le lactate environ 3 fois plus vite que de rester assis.", es:"La recuperación activa elimina el lactato unas 3 veces más rápido que quedarse sentado." },
  { fr:"Produire du lactate n'est pas « mauvais » : plus tu en produis par unité de temps, plus tu as fourni de travail (c'est un marqueur d'intensité).", es:"Producir lactato no es «malo»: cuanto más produces por unidad de tiempo, más trabajo has realizado (es un marcador de intensidad)." },
  { fr:"Plus l'effort dure, plus le corps passe du glycogène aux lipides : d'où les glucides sur les efforts intenses et les réserves de gras sur le très long.", es:"Cuanto más dura el esfuerzo, más pasa el cuerpo del glucógeno a los lípidos: de ahí los carbohidratos en esfuerzos intensos y las reservas de grasa en el muy largo." },
];

export type WeekRow = { day: BiText; session: BiText; fil: BiText };
export const WEEK_PLAN: WeekRow[] = [
  { day:{fr:"Jour 1",es:"Día 1"}, session:{fr:"45 min endurance facile",es:"45 min resistencia fácil"}, fil:{fr:"Aérobie basse",es:"Aeróbica baja"} },
  { day:{fr:"Jour 2",es:"Día 2"}, session:{fr:"8 × 10 s sprint / 2 min repos",es:"8 × 10 s sprint / 2 min descanso"}, fil:{fr:"Anaérobie alactique",es:"Anaeróbica aláctica"} },
  { day:{fr:"Jour 3",es:"Día 3"}, session:{fr:"Repos ou technique légère",es:"Descanso o técnica ligera"}, fil:{fr:"Récupération",es:"Recuperación"} },
  { day:{fr:"Jour 4",es:"Día 4"}, session:{fr:"6 × 1 min très intense / 2 min repos",es:"6 × 1 min muy intenso / 2 min descanso"}, fil:{fr:"Anaérobie lactique",es:"Anaeróbica láctica"} },
  { day:{fr:"Jour 5",es:"Día 5"}, session:{fr:"Musculation explosive ou pliométrie",es:"Fuerza explosiva o pliometría"}, fil:{fr:"Alactique / puissance",es:"Aláctica / potencia"} },
  { day:{fr:"Jour 6",es:"Día 6"}, session:{fr:"4 à 6 rounds spécifiques sport",es:"4 a 6 rounds específicos del deporte"}, fil:{fr:"Mixte",es:"Mixta"} },
  { day:{fr:"Jour 7",es:"Día 7"}, session:{fr:"Repos complet",es:"Descanso completo"}, fil:{fr:"Récupération",es:"Recuperación"} },
];
