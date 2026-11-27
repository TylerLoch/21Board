# Glossary

The words CCSD21 uses in Spanish, Russian, and Ukrainian. The Spanish is US Spanish with Mexican words. For
everyone who writes or reviews 21Board's words tables. [TRANSLATING.md](TRANSLATING.md) says how.

The same 186 entries are in tools/glossary.json, which `node tools/words.js --glossary <id>` reads. Both come from
one list in tools/make-glossary.py. Change the list there, then run `python3 tools/make-glossary.py`.

Code lines cite release 2026.11.26-11. calc-engine.js means widgets/calculator/calc-engine.js.

How to read a row: the words to use on the board, in the form a widget shows them. "a; b" means two forms, such as
two genders, or a button and a plain word. Source codes are in the legend below. "—" means no CCSD21 or Amplify
document used the word, so the row is standard usage.

## What the district's documents show

**Sources read.** CCSD21's 2026-27 academic calendar in all four languages. The 2016-17 Parent-Student
Handbook in Spanish, Russian, and English (PDFs still on ccsd21.org). The Russian FY27 fee waiver letter.
Nine months of the 2023-24 Family Newsletter in English, Spanish, Russian, and Ukrainian (36 PDFs on Google
Drive). Two Amplify Desmos Math caregiver overviews in Spanish (grade 3 and grade 4, unit 4). EPA AirNow in
Spanish for air quality. Two non-CCSD21 Spanish Zones of Regulation handouts.

**How good each source is.**
- Calendars. Spanish and Ukrainian are careful human work. Russian is human but careless: made-up weekday
  headers (CAL-RU p1 "ПО В С Ч ПЯ"), English word order ("Август 19"), "осенний каникул", and "for K-B" left in
  English (CAL-RU p2). Use it for words, not for grammar or format.
- 2016-17 handbooks. Good human translations. Russian writes ё ("ребёнку", HB-RU p5).
- 2023-24 newsletters. Machine translated. Tells: "Si usted esinterésed, aplicar aquí" (NL-2024-02-ES p5),
  "Если тыинтересЭд, применять здесь" (NL-2024-02-RU p5), "Якщо виінтересвид, застосувати тут"
  (NL-2024-02-UK p5), "Зараз найму!" (same page). They flip between formal and informal "you" from one line
  to the next. Use them only to see which everyday word appears, never for tone.
- Amplify. Professional Spanish for families and students.

**Programs.** Dual language is Spanish/English at Field and Whitman and Russian/English at Kilmer and Poe,
K-5, about 80% home language in K-2 (https://ccsd21.org/equity-learning/dual-language/). So Russian, like
Spanish, is a language children learn to read in at school. There is no Ukrainian program. Spanish
bilingual (Pre-K to 3) runs at Frost, Hawthorne, Kilmer, and Twain
(https://ccsd21.org/equity-learning/bilingual-and-english-as-a-second-language/).

## District tone

**Spanish.** Families get formal *usted*: "Estimados estudiantes y padres" and "pregunte al maestro de su
hijo/a" (HB-ES p4), "Estimado Padre de familia o tutor" (HB-ES p51), "padres/tutores" (HB-ES p10). The
district never writes to students alone; they're addressed with their parents as *ustedes* (HB-ES p4).
Amplify's student pages use *tú* ("Muestra tus ideas", "asigna", "resuelve", ADM3-ES p3-4); its caregiver
lines use *usted* ("Puede leer… con su estudiante", ADM3-ES p1). Words lean Mexican and US: "salón de
clases" and "maestro del salón" (HB-ES p4), "computadora" (HB-ES p28), "Kinder" and "Preescolar"
(CAL-ES p2). One slip: "teléfonos móviles" (HB-ES p30), where Mexico says "celular". The Spanish calendar
copies English Title Case ("Primer Día de Clases", "Todos los Edificios están Cerrados"); Spanish uses
sentence case. Weekdays and months are lowercase (correct).

**Russian.** Families get formal *вы*, lowercase in the body: "Уважаемый родитель/опекун!" (FEE-RU p1),
"Уважаемые учащиеся и родители!" (HB-RU p5), "спросите учителя вашей дочери или сына" (HB-RU p5). Students
are "учащиеся" in formal text. The handbook writes ё; the fee letter doesn't ("ребенок", FEE-RU p1).

**Ukrainian.** The only careful source is the calendar. It writes dates in the genitive ("19 серпня"),
weekdays lowercase ("понеділок"), 24-hour times ("9:00 – 15:30"), "до обіду" and "після обіду" for AM
and PM, and the apostrophe ’ ("п’ятниця", "пам’яті") (CAL-UK p1-2). No Ukrainian text addresses anyone
directly except the machine newsletters.

**Kept in English, in every language.** School and district names ("School District 21" inside Russian
sentences, HB-RU p5; "Cindy Kile (Синди Кайл)", FEE-RU p2). "Pre-K", "K-A", "K-B" (all calendars).
"AM" and "PM" in the Russian calendar (CAL-RU p2). Hours in the Spanish calendar ("9 a.m. to 3:30 p.m.",
CAL-ES p1). Product and program names: Chromebook (NL-2023-11-UK p6), ParentSquare, PowerSchool, SNAP, TANF
(FEE-RU p1), Caregiver Hub (ADM3-ES p1). Amplify also prints the English task word beside the Spanish on
student pages ("Muestra tus ideas. Show your thinking", "Dibuja Draw", ADM3-ES p4).

## Choices for the board

**"You" to a student.** The interface and menus stay English for now, so translated text speaks to
children. Use the singular informal: *tú* (es), *ты* (ru), *ти* (uk). That matches Amplify's student pages
and how Russian and Ukrainian children's material talks to a child. Never *vosotros*. When a line clearly
speaks to the whole class, use the plural: *ustedes* ("¡Fórmense!"), *вы* ("Постройтесь"), *ви*
("Шикуйтеся"). Example lines: "Toma agua", "Попей воды", "Попий води".

**Buttons.** Spanish takes the infinitive (Iniciar, Pausar, Reanudar, Restablecer), as Apple's es-MX
Clock does. Russian and Ukrainian take a short noun or infinitive (Старт, Стоп, Пауза; Продолжить /
Продовжити; Сбросить / Скинути).

**Gender.** The board never knows a child's gender. Spanish uses the masculine on single words, as Mexican
classroom posters do, or a gender-free word (triste, feliz). Russian and Ukrainian use nouns or
present-tense verbs, which carry no gender: "Грусть", "Болею", "Побеждает {name}". Avoid past tense with a
name in ru/uk ("выиграл/выиграла").

**Plurals.** Spanish has one and other. Russian and Ukrainian need four slots for Intl.PluralRules: one (1,
21, 31), few (2-4, 22-24), many (0, 5-20, 25-30), and other (fractions such as 1.5). The noun's case also
changes after "for N" (accusative: "1 минуту", "1 хвилину").

**Numbers, dates, and time.** Math stays English: "." for decimals, "1,000" grouping, ÷ and ×.
Mexico already uses the point, so Spanish has no conflict. Russian and Ukrainian schools write "3,5", ":"
for divide, and "·" for times; the board does not follow them. Dates: spell the month to avoid 11/12 vs
12/11 ("19 de agosto", "19 августа", "19 серпня"). The week starts on Sunday, as in an American classroom.
Time is 12-hour in every language. Russian and Ukrainian give the time of day in words: "3:05 дня", "9:05 ранку".

**Spanish: Mexico, not Spain.** computadora (not ordenador), celular (móvil), chamarra (chaqueta), playera
(camiseta), enojado (enfadado), tomar agua (beber), jugo (zumo), carro (coche), pizarrón (pizarra), alberca
(piscina), plastilina, crayolas, "Alto" on stop signs (not "Stop" or "Pare"), "amarillo" light (not
"ámbar"), "el clima" for weather (not "el tiempo"), "maestro" (not "profesor") for K-8. Never "excitado"
for excited: use "emocionado".

**Ukrainian that never reads as Russian.** Write Ukrainian words, not Russian ones in Ukrainian letters.
зараз (сейчас), тиждень (неделя; uk "неділя" is Sunday), годинник (часы; uk "година" is an hour, "час" is
time), хвилина (минута), секундомір (секундомер), наступний (следующий), найкращий (лучший), відповідь
(ответ), дорівнює (равно), остача (остаток), відсоток (процент), Скинути (Сбросить), Скасувати
(Отменить), Час сплив (Время вышло), червоний (красный), жовтий (желтый), хмарно (облачно), мряка
(морось), вітер (ветер), сніг (снег), схід / захід сонця (восход / закат), рукавички (перчатки), чоботи
(сапоги), мова (язык). Month names share nothing with Russian. Letters ы, э, ъ, and ё never appear;
і, ї, є, ґ, and the apostrophe ’ do. Ukrainian also has a vocative for names ("Аню"), so don't address a
child by a typed name.

**Russian ё.** Write it in children's text (жёлтый, зелёный, всё, ещё), as HB-RU does. Young readers
learn with ё.

**Words that carry a sexual sense in children's text.** es "excitado", ru "возбуждение / возбуждённый",
uk "збудження / збуджений". Use "emocionado", "восторг", "захват" instead.

## Legend

<!-- glossary:legend -->
| Code | Document | URL |
| --- | --- | --- |
| CAL-EN | CCSD21 2026-27 academic calendar, English (2 pages) | https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-ENG.pdf |
| CAL-ES | CCSD21 2026-27 academic calendar, Spanish (2 pages, human translation) | https://ccsd21.org/wp-content/uploads/2026/04/2026-2027-Academic-Calendar-SPA-1.pdf |
| CAL-RU | CCSD21 2026-27 academic calendar, Russian (2 pages, human but careless) | https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-RUS.pdf |
| CAL-UK | CCSD21 2026-27 academic calendar, Ukrainian (2 pages, good human translation) | https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-UKR.pdf |
| HB-ES | CCSD21 Parent-Student Handbook 2016-17, Spanish (53 pages, human translation) | https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookSpanish.pdf |
| HB-RU | CCSD21 Parent-Student Handbook 2016-17, Russian (51 pages, human translation) | https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookRussian.pdf |
| HB-EN | CCSD21 Parent-Student Handbook 2016-17, English | https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookEnglish.pdf |
| FEE-RU | CCSD21 FY27 fee waiver letter and application, Russian (3 pages) | https://ccsd21.org/wp-content/uploads/2026/07/FY27-CEP-Fee-Waiver-Letter-and-Application-RUSSIAN.pdf |
| ADM3-ES | Amplify Desmos Math, grade 3 unit 4 caregiver overview, Spanish (29 pages) | https://amplify.com/wp-content/uploads/2025/09/ADM-3-4-caregiver-unit-overview-1E-ES.pdf |
| ADM4-ES | Amplify Desmos Math, grade 4 unit 4 caregiver overview, Spanish (29 pages) | https://amplify.com/wp-content/uploads/2025/09/ADM-4-4-caregiver-unit-overview-1E-ES.pdf |
| AIRNOW-ES | EPA AirNow, AQI basics in Spanish (US government) | https://www.airnow.gov/aqi/aqi-basics-in-spanish/ |
| COBB-ES | Cobb County (GA) schools, Zones of Regulation parent resource, English-Spanish (not CCSD21) | https://media.cobbk12.org/media/WWWCobb/medialib/zonesofregulation_parentresource_english-spanish_spanishrevised.1a4a16134473.pdf |
| BMC-ES | Boston Medical Center, Zonas de regulación emocional, 2015 (not CCSD21) | https://www2.bmc.org/sites/default/files/Patient_Care/Specialty_Care/Pediatrics%20-%20Autism/resources/Zonas%20de%20regulaci%C3%B3n%20emocional.pdf |
| NL-YYYY-MM-LL | CCSD21 Family Newsletter, 2023-24, Google Drive PDFs (machine translated; weak evidence) | One Drive file per month and language; full URL in tools/glossary.json |
<!-- /glossary:legend -->

## Words

<!-- glossary:words -->
### School and people

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| school | escuela | школа | школа | CAL-ES p1, CAL-RU p1, CAL-UK p1 | Calendars: "Escuela Primaria", "Начальная школа", "Початкова школа". |
| class (the group of students) | clase; grupo | класс | клас | CAL-ES p2, CAL-RU p2, CAL-UK p2 | Mexican teachers call their class "el grupo". A lesson is "clase" (es), "урок" or "занятие" (ru), "урок" or "заняття" (uk). ru/uk "класс/клас" also means grade. |
| classroom | salón de clases | класс | клас; класна кімната | HB-ES p4, HB-RU p5 | District: "en el salón de clases", "с учащимися в классе". "Aula" is Spain-leaning and formal; it shows up only in the machine-translated newsletter (NL-2023-11-ES p2). |
| teacher | maestro; maestra | учитель; учительница | учитель; учителька | HB-ES p4, HB-RU p5, CAL-UK p1 | Mexico says "maestro/maestra" in K-8, not "profesor". Ukrainian swaps у/в by sound: "Учитель" at the start, "до вчителя" after a vowel (CAL-UK p1 "вчительські"). |
| student | estudiante; alumno | ученик; ученица | учень; учениця | HB-ES p4, HB-RU p4, NL-2023-10-UK p2 | District writes "estudiantes" (es) and formal "учащиеся" (ru). For K-8 kids use ru "ученик", uk "учень" (NL "учнів"). uk "студент" means a college student; the machine newsletters misuse it. |
| homeroom teacher | maestro del salón | классный руководитель | класний керівник | HB-ES p4, HB-RU p5 | Both from the handbook sign-off form. |
| friend | amigo; amiga | друг; подруга | друг; подруга | ADM3-ES p3 | Zones idea "Help a friend": "Ayuda a un amigo", "Помоги другу", "Допоможи другові". |
| group | grupo | группа | група | CAL-ES p2, CAL-RU p2, NL-2023-12-UK p7 | Plurals: ru 1 группа, 2 группы, 5 групп; uk 1 група, 2 групи, 5 груп. "Make 3 groups": "Hacer 3 grupos", "Сделать 3 группы", "Створити 3 групи". |
| team | equipo | команда | команда | HB-ES p38, HB-RU p12, NL-2023-10-UK p2 | "Deportes de equipo", "командных видах спорта". |
| turn | turno | ход; очередь | хід; черга | — | "Your turn": "Es tu turno", "Твой ход", "Твій хід". "Take turns": "Tomar turnos", "По очереди", "По черзі". |
| winner | ganador; ganadora | победитель; победительница | переможець; переможниця | — | Gendered in all three, and the board does not know a name's gender. Prefer a verb: "{name} wins" as "¡Gana {name}!", "Побеждает {name}!", "Перемагає {name}!". Ukrainian puts names in the vocative when you speak to someone ("Аню"); a name the teacher typed cannot be inflected, so avoid direct address with a name. |
| name / names | nombre; nombres | имя; имени; имён | ім’я; імені; імен | — | ru 1 имя, 2 имени, 5 имён; uk 1 ім’я, 2 імені, 5 імен. "Pick a name": "Elegir un nombre", "Выбрать имя", "Вибрати ім’я". |
| grade (school level) | grado | класс | клас | CAL-ES p2, ADM3-ES p1, CAL-RU p2, CAL-UK p2 | Ordinals: es "3.er grado", "2.º grado" (Amplify style); ru "3-й класс"; uk "3-й клас". District: "Grados 1-8", "1-8 классы", "1–8 класи". |
| kindergarten | kínder | подготовительный класс | підготовчий клас | CAL-ES p2, CAL-RU p2, CAL-UK p2 | District es writes "Kinder" (RAE: "kínder"). CAL-RU keeps the English word "Kindergarten". CAL-UK says "дитячий садок", which means daycare. On the board, "K" works in all four. |
| preschool / Pre-K | preescolar | Pre-K | Pre-K | CAL-ES p2, CAL-RU p2, CAL-UK p2 | ru/uk calendars keep "Pre-K" in Latin letters (CAL-RU also writes "Пре-K"). |
| parents / guardians | padres; tutores | родители; опекуны | батьки; опікуни | HB-ES p10, HB-RU p10, NL-2023-11-UK p3 | District: "padres/tutores", "родителям или опекунам", "батьків/опікунів". uk "батьки" is plural only. |

### Time and schedule

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| schedule | horario | расписание | розклад | CAL-ES p1, CAL-UK p1 | Calendars: "HORARIO ESCOLAR", "РОЗКЛАД НАВЧАЛЬНОГО ДНЯ". CAL-RU p1 says "УЧЕБНЫЕ ЧАСЫ" (school hours). |
| day / days | día; días | день; дня; дней | день; дні; днів | CAL-ES p1, CAL-RU p1, CAL-UK p1 | ru 1 день, 2 дня, 5 дней; uk 1 день, 2 дні, 5 днів. |
| week | semana | неделя | тиждень | HB-ES p4, HB-RU p5, NL-2023-10-UK p2 | False friend: uk "неділя" means Sunday. Never write "неделя" in Ukrainian. |
| today | hoy | сегодня | сьогодні | NL-2023-10-ES p4, NL-2023-10-RU p4, NL-2023-10-UK p4 |  |
| tomorrow | mañana | завтра | завтра | — | es "mañana" also means "morning". |
| yesterday | ayer | вчера | учора | — | uk "учора" and "вчора" are both standard; use "Учора" at the start of a label. |
| now | ahora | сейчас | зараз | — | Weather "Now" column. uk "зараз", never "сейчас". |
| morning | mañana; por la mañana | утро; утром | ранок; вранці | CAL-ES p2, CAL-UK p2 | Greeting: "Buenos días", "Доброе утро", "Доброго ранку". CAL-ES p2 "Clases solo por la Mañana". CAL-UK p2 writes "до обіду" (before lunch) for AM. |
| afternoon | tarde; por la tarde | день; после обеда | день; після обіду | CAL-UK p2 | Greeting: "Buenas tardes", "Добрый день", "Добрий день". CAL-UK p2 "(після обіду)" for PM. CAL-RU p2 leaves "AM" and "PM" in English. |
| a.m. / p.m. | a. m.; p. m. | AM; PM | AM; PM | CAL-ES p1, NL-2023-10-ES p6, CAL-RU p1, CAL-UK p1 | Mexico uses the 12-hour clock with "a. m./p. m." (NL: "9:30 a. m. a 2:45 p. m."; CAL-ES p1 leaves "9 a.m. to 3:30 p.m." in English). ru/uk have no AM/PM; their calendars use 24-hour time ("c 0900 до 1530", "9:00 – 15:30"). Open question for the Clock. An American classroom suggests a 12-hour face in every language, with "AM/PM" kept in Latin letters for ru/uk as CAL-RU p2 does. |
| hour / hours | hora; horas | час; часа; часов | година; години; годин | HB-ES p15, HB-RU p9, NL-2023-11-UK p6 | ru/uk need four plural forms: one (1, 21), few (2-4), many (5-20, 0), other (1.5): ru час/часа/часов/часа, uk година/години/годин/години. Short: "h", "ч", "год". uk "час" means time and "годинник" means clock. |
| minute / minutes | minuto; minutos | минута; минуты; минут | хвилина; хвилини; хвилин | NL-2024-02-ES p4, NL-2024-02-RU p4, NL-2024-02-UK p4 | After "for" ru/uk take the accusative: "1 минуту", "1 хвилину" ("Sit quietly for 2 minutes": "Siéntate en silencio 2 minutos", "Посиди тихо 2 минуты", "Посидь тихо 2 хвилини"). Other (1.5): "минуты", "хвилини". Short: "min", "мин", "хв" (uk is not "мин"). |
| second / seconds | segundo; segundos | секунда; секунды; секунд | секунда; секунди; секунд | — | Short: "s", "с", "с". Same four plural slots as minute. |
| timer | temporizador | таймер | таймер | — | Apple es-MX Clock says "Temporizador". "Cronómetro" is the stopwatch. |
| stopwatch | cronómetro | секундомер | секундомір | — | uk "секундомір", not "секундомер". |
| clock | reloj | часы | годинник | — | ru "часы" is plural only. uk "годинник" (not "часи"). |
| calendar | calendario | календарь | календар | CAL-ES p1, CAL-RU p1, CAL-UK p1 |  |
| start (button) | Iniciar | Старт | Старт | — | Plain "begin": "Empezar", "Начать", "Почати". Buttons: Spanish infinitive; ru/uk a noun or infinitive, as phone clock apps do. |
| stop (button) | Detener | Стоп | Стоп | — | A shouted "Stop!" in a game or on a sign is es "¡Alto!" (see stop/slow/go). |
| pause | Pausar | Пауза | Пауза | — | The title bar status "Paused" stays English (answers.md Q1). |
| resume | Reanudar | Продолжить | Продовжити | CAL-ES p2, CAL-RU p2, CAL-UK p2 | Button words above. The calendars' "classes resume" is "Regreso a Clases", "Уроки начинаются снова", "Відновлення занять". |
| reset | Restablecer | Сбросить | Скинути | — | es "Reiniciar" means restart; Apple es-MX stopwatch uses "Restablecer". uk "Скинути", not "Сбросить". |
| undo | Deshacer | Отменить | Скасувати | — | uk "Скасувати" is also "Cancel"; if both sit on one screen, make Cancel "Закрити" or rephrase. Avoid "Відмінити" (a Russism in this sense). |
| cancel | Cancelar | Отмена | Скасувати | — |  |
| start over | Empezar de nuevo | Начать заново | Почати знову | — | Name Picker and Zones "Start over". |
| next | Siguiente | Далее; следующий | Далі; наступний | HB-ES p15, HB-RU p15, NL-2023-10-UK p5 | Button: "Siguiente", "Далее", "Далі". Adjective: "el próximo año", "следующий учебный год", "наступного тижня". uk never "следующий". |
| previous | Anterior | Назад; предыдущий | Назад; попередній | — | "Previous month": "Mes anterior", "Предыдущий месяц", "Попередній місяць". |
| done; finished | ¡Listo!; terminado | Готово! | Готово! | — | "All done!": "¡Todo listo!", "Всё готово!", "Усе готово!". |
| ready | listo; lista | готов; готова | готовий; готова | BMC-ES p1 | Gendered. Zones "Ready to Learn": "Listo para aprender" (BMC-ES p1); ru/uk gender-free nouns "Готовность учиться", "Готовність учитися". |
| time's up | ¡Se acabó el tiempo! | Время вышло! | Час сплив! | — | uk "Час сплив" is the native idiom; "Час вийшов" copies Russian. |
| almost done (time nearly up) | Queda poco tiempo | Осталось немного | Залишилося трохи | — | Timer warning: the time, not a task, is nearly up. Title bar stays English (Q1). |
| lap | vuelta | круг | коло | — | "Lap 3": "Vuelta 3", "Круг 3", "Коло 3". "Fastest lap": "Vuelta más rápida", "Самый быстрый круг", "Найшвидше коло". |
| record; best time | récord; mejor tiempo | рекорд; лучшее время | рекорд; найкращий час | — | "New record": "¡Nuevo récord!", "Новый рекорд!", "Новий рекорд!". uk "найкращий", not "лучший". |
| total (time) | total | всего | усього | ADM3-ES p3 | Stopwatch "Total" beside a lap time. Dice total is "Suma"/"Сумма"/"Сума" (see Games). |
| holiday (no school) | día festivo (no hay clases) | праздник (школы нет) | свято (занять немає) | CAL-ES p1, CAL-RU p1, CAL-UK p1 | Calendar legends: "Día Festivo (No hay Clases)", "праздничный день (Школы нет)", "Свято (занять немає)". Write Spanish in sentence case, not the calendar's Title Case. |
| first day of school | primer día de clases | первый день занятий | перший день навчання | CAL-ES p1, CAL-RU p1, CAL-UK p1 |  |
| break (days off) | vacaciones | каникулы | канікули | CAL-ES p2, CAL-RU p2, CAL-UK p1 | "Winter break": "Vacaciones de invierno", "Зимние каникулы", "Зимові канікули". ru/uk are plural only (CAL-RU p1 "осенний каникул" is a grammar error). |
| school year | año escolar | учебный год | навчальний рік | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |

### Weekdays

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| Sunday | domingo (dom) | воскресенье (Вс) | неділя (Нд) | — | Not on the district calendar (school days only). US and Mexican calendars start on Sunday; Russian and Ukrainian ones start on Monday. |
| Monday | lunes (lun) | понедельник (Пн) | понеділок (Пн) | CAL-ES p2, CAL-RU p2, CAL-UK p2 | Weekdays are lowercase mid-sentence in all three. The ru/uk calendars use made-up headers ("ПО В С Ч ПЯ", "ПО В С Ч П'"); use the standard two-letter forms shown. |
| Tuesday | martes (mar) | вторник (Вт) | вівторок (Вт) | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |
| Wednesday | miércoles (mié) | среда (Ср) | середа (Ср) | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |
| Thursday | jueves (jue) | четверг (Чт) | четвер (Чт) | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |
| Friday | viernes (vie) | пятница (Пт) | п’ятниця (Пт) | CAL-ES p2, CAL-RU p2, CAL-UK p2 | uk apostrophe is ’ (U+2019), as CAL-UK p2 "п’ятниця". |
| Saturday | sábado (sáb) | суббота (Сб) | субота (Сб) | — | uk "субота" has one б. |

### Months

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| January | enero | январь | січень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de enero", "19 января", "19 січня". Month names are lowercase in all three except at the start of a header. Ukrainian names share nothing with Russian. CAL-RU p2 writes "Август 19" (English order); don't copy it. Intl gives ru "январь 2027 г." and uk "січень 2027 р."; capitalize the first letter for a header. |
| February | febrero | февраль | лютий | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de febrero", "19 февраля", "19 лютого". |
| March | marzo | март | березень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de marzo", "19 марта", "19 березня". |
| April | abril | апрель | квітень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de abril", "19 апреля", "19 квітня". |
| May | mayo | май | травень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de mayo", "19 мая", "19 травня". |
| June | junio | июнь | червень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de junio", "19 июня", "19 червня". |
| July | julio | июль | липень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de julio", "19 июля", "19 липня". |
| August | agosto | август | серпень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de agosto", "19 августа", "19 серпня". |
| September | septiembre | сентябрь | вересень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de septiembre", "19 сентября", "19 вересня". |
| October | octubre | октябрь | жовтень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de octubre", "19 октября", "19 жовтня". |
| November | noviembre | ноябрь | листопад | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de noviembre", "19 ноября", "19 листопада". |
| December | diciembre | декабрь | грудень | CAL-ES p1, CAL-RU p1, CAL-UK p1 | In a date: "19 de diciembre", "19 декабря", "19 грудня". |

### Seasons

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| fall; autumn | otoño | осень | осінь | CAL-ES p1, CAL-RU p1, CAL-UK p1 | First/Then themes. Calendars: "Vacaciones otoño", "осенний", "Осінні канікули". |
| winter | invierno | зима | зима | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |
| spring | primavera | весна | весна | CAL-ES p2, CAL-RU p2, CAL-UK p2 |  |
| summer | verano | лето | літо | — |  |

### Class activities and subjects

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| activity | actividad | занятие | заняття | HB-ES p6, CAL-RU p1, CAL-UK p1 | ru "мероприятие" means an event; a class activity is "занятие". |
| first / then | Primero / Después | Сначала / Потом | Спочатку / Потім | — | Standard first-then board words in each language. The widget's CSS makes them capitals. |
| break (short rest) | descanso | перерыв | перерва | — | Keep apart from recess in uk (see next row). |
| recess | recreo | перемена | велика перерва | HB-ES p40, NL-2024-02-RU p5, NL-2024-02-UK p5 | HB-ES p40 "Educación Física/Recreo". HB-RU p39 drops recess. The machine newsletters say "перемен", "перерв". Russian and Ukrainian schools have no recess; "перемена" is the break between lessons. uk "велика перерва" (the long break) keeps it apart from "перерва". |
| lunch | almuerzo | обед | обід | HB-ES p6, HB-RU p7, NL-2024-02-UK p5 | "Programa de desayuno y almuerzo", "Программа завтрака и обеда". Mexican kids also say "lonche". |
| snack | refrigerio | перекус | перекус | — | Mexican school word "refrigerio". "Merienda" is an afternoon snack; "bocadillo" is a sandwich in Spain. |
| reading | lectura | чтение | читання | HB-ES p3, HB-RU p4, NL-2023-12-UK p4 |  |
| writing | escritura | письмо | письмо | ADM4-ES p14 | ru/uk "письмо" also means a letter. |
| math | matemáticas | математика | математика | HB-ES p3, HB-RU p4, NL-2024-02-UK p4 |  |
| science | ciencias | естествознание | природознавство | NL-2024-04-ES p4, NL-2024-04-RU p4 | NL: "Evaluación de ciencias", "естественных наук". ru "наука" alone is wrong for the school subject. For middle school "естественные науки", "природничі науки". |
| art | arte | рисование | малювання | — | K-5 art class is drawing class in ru/uk. Middle school: "ИЗО", "образотворче мистецтво". "Art & coloring": "Arte y colorear", "Рисование и раскраски", "Малювання й розмальовки". |
| music | música | музыка | музика | NL-2023-12-RU p2 | "Music class": "Clase de música", "Урок музыки", "Урок музики". |
| PE; gym | educación física; gimnasio | физкультура; спортзал | фізкультура; спортзал | HB-ES p40, HB-RU p39, NL-2023-10-UK p6, NL-2023-11-ES p4, NL-2023-11-UK p4 | Class: "educación física", "физкультура" (HB-RU p39), "фізкультура". Room: "gimnasio", "спортзал". |
| library | biblioteca | библиотека | бібліотека | NL-2023-10-ES p6, NL-2023-10-RU p6, NL-2023-10-UK p6 |  |
| clean up | Recoger | Уборка | Прибирання | — | Mexican teachers: "¡A recoger!". "Limpiar" means to wipe clean. |
| line up | Hacer fila | Построиться | Шикуватися | — | Mexican classrooms say "Formarse" ("¡Fórmense!"); "hacer fila" is understood everywhere. |
| quiet | silencio | тишина | тиша | — | "Quiet corner": "Rincón tranquilo", "Тихий уголок", "Тихий куточок". "Calm corner": "Rincón de la calma", "Уголок спокойствия", "Куточок спокою". |
| listen | escuchar | слушать | слухати | — | uk "слухати", not "слушати". |
| wash hands | Lavarse las manos | Помыть руки | Помити руки | — |  |
| bathroom | baño | туалет | туалет | — | Mexico "baño"; "sanitario" is formal signage. |
| computer | computadora | компьютер | комп’ютер | HB-ES p28, HB-RU p28, NL-2023-11-UK p6 | Mexico/US "computadora" (Spain "ordenador"). Keep "Chromebook" and "iPad" in Latin letters, as the district does (NL-2023-11-UK p6). |
| cell phone | celular | мобильный телефон | мобільний телефон | HB-ES p30, HB-RU p30, COBB-ES p2 | HB-ES p30 used Spain's "teléfonos móviles"; Mexican/US Spanish says "celular" (COBB-ES p2). |
| language | idioma | язык | мова | — | uk "мова", never "язик" (that is the tongue). Menu names stay English (Tyler). |

### Feelings (Zones of Regulation)

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| Zones of Regulation | Zonas de Regulación | Зоны регуляции | Зони регуляції | COBB-ES p2 | Zone names: "Zona azul/verde/amarilla/roja"; "Синяя/Зелёная/Жёлтая/Красная зона"; "Синя/Зелена/Жовта/Червона зона". Feelings below follow widgets/zones-check-in/index.html:259-279. |
| sad | Triste | Грусть | Сум | BMC-ES p1 | Pattern: Spanish adjectives in the masculine, as Mexican classroom posters do; ru/uk nouns, as Russian and Ukrainian emotion cards do. Nouns keep ru/uk free of gender, which the board cannot know. Adjectives if wanted: ru грустный/грустная, uk сумний/сумна. |
| tired | Cansado | Усталость | Втома | BMC-ES p1 |  |
| sick | Enfermo | Болею | Хворію | BMC-ES p1 | ru/uk first-person verbs are gender-free. |
| slow | Lento | Вялость | Млявість | — | The turtle chip. |
| ready to learn | Listo para aprender | Готовность учиться | Готовність учитися | BMC-ES p1 |  |
| calm | Tranquilo | Спокойствие | Спокій | BMC-ES p1 | Mexico "tranquilo"; "calmado" is fine too. |
| happy | Feliz | Радость | Радість | — | BMC-ES p1 also lists "Contento". |
| elevated | Acelerado | Много энергии | Багато енергії | — | Avoid es "excitado", ru "возбуждение", uk "збудження": all carry a sexual sense. |
| silly | Juguetón | Дурачусь | Пустую | — | BMC-ES p1 says "Tonto", which means dumb; use "juguetón". Nouns if wanted: "Озорство", "Пустощі". |
| frustrated | Frustrado | Досада | Досада | BMC-ES p1 | ru/uk "фрустрация/фрустрація" is clinical. |
| angry | Enojado | Злость | Злість | BMC-ES p1 | Mexico "enojado" (Spain "enfadado"). |
| intense | Alterado | Напряжение | Напруга | — | es "intenso" describes a personality, not a feeling. |
| overwhelmed | Abrumado | Перегрузка | Перевантаження | — | BMC-ES p1 also lists "Agobiado". |
| worried | Preocupado | Тревога | Тривога | BMC-ES p1 |  |
| excited | Emocionado | Восторг | Захват | — | Never es "excitado". BMC-ES p1 has "Entusiasmado". |
| Drink water (an idea line) | Toma agua | Попей воды | Попий води | — | Sample of the "you" form for one student: tú (es), ты (ru), ти (uk). Mexico "tomar agua" (Spain "beber"). |
| Take 3 deep breaths | Respira hondo 3 veces | Сделай 3 глубоких вдоха | Зроби 3 глибокі вдихи | — | Numbers change the case: ru "3 глубоких вдоха", uk "3 глибокі вдихи". |
| Talk to your teacher | Habla con tu maestro | Поговори с учителем | Поговори з учителем | — | es uses the masculine as the generic. The board can't know the teacher is a woman ("tu maestra"). |
| stress ball; fidget | pelota antiestrés | мячик-антистресс | м’ячик-антистрес | COBB-ES p4 | "Use a fidget": "Usa un juguete antiestrés", "Возьми антистресс", "Візьми антистрес". |

### Weather

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| weather | clima; tiempo | погода | погода | HB-ES p49, NL-2024-01-ES p2, HB-RU p48, NL-2024-01-UK p2 | Mexico/US say "el clima" for weather ("inclemencias del clima"); Spain says "el tiempo". |
| sunny | Soleado | Солнечно | Сонячно | — | Condition words follow widgets/weather/index.html:1141-1142.  |
| clear (night) | Despejado | Ясно | Ясно | — |  |
| mostly sunny | Mayormente soleado | Преимущественно солнечно | Переважно сонячно | — | uk "переважно", never "преимущественно". |
| mostly clear | Mayormente despejado | Преимущественно ясно | Переважно ясно | — |  |
| partly cloudy | Parcialmente nublado | Переменная облачность | Мінлива хмарність | — |  |
| cloudy | Nublado | Облачно | Хмарно | — | uk "хмарно", not "облачно". |
| fog | Niebla | Туман | Туман | — |  |
| drizzle | Llovizna | Морось | Мряка | — | uk "мряка", not "морось". |
| rain | Lluvia | Дождь | Дощ | — |  |
| snow | Nieve | Снег | Сніг | CAL-ES p1, NL-2024-01-UK p5 | CAL-ES p1 "días de emergencia/nieve"; NL "снігові/надзвичайні дні". |
| thunderstorms | Tormentas eléctricas | Гроза | Гроза | — | es "tormenta" alone is any storm. |
| wind | Viento | Ветер | Вітер | — |  |
| temperature | Temperatura | Температура | Температура | HB-RU p35 |  |
| feels like | Sensación térmica | Ощущается как | Відчувається як | — |  |
| high / low | Máxima / Mínima | Макс. / Мин. | Макс. / Мін. | — | uk "Мін." with і. |
| sunrise | Salida del sol | Восход | Схід сонця | — | widgets/weather/index.html:1232. |
| sunset | Puesta del sol | Закат | Захід сонця | — | uk "захід", not "закат". |
| air quality | Calidad del aire | Качество воздуха | Якість повітря | AIRNOW-ES | AQI levels below agree with the noun: ru neuter (качество), uk feminine (якість). widgets/weather/index.html:1178-1183. |
| air quality: Good | Bueno | Хорошее | Добра | AIRNOW-ES | Spanish is EPA's own wording (its page prints "Insalubres" for red; singular is correct). |
| air quality: Moderate | Moderado | Умеренное | Помірна | AIRNOW-ES |  |
| air quality: Unhealthy for sensitive groups | Insalubre para grupos sensibles | Вредное для чувствительных групп | Шкідлива для чутливих груп | AIRNOW-ES |  |
| air quality: Unhealthy | Insalubre | Вредное | Шкідлива | AIRNOW-ES |  |
| air quality: Very unhealthy | Muy insalubre | Очень вредное | Дуже шкідлива | AIRNOW-ES |  |
| air quality: Hazardous | Peligroso | Опасное | Небезпечна | AIRNOW-ES |  |
| coat | Abrigo | Зимняя куртка | Зимова куртка | — | What to wear: widgets/weather/index.html:602-610. ru/uk "пальто" is a dress coat; kids wear a winter jacket. |
| jacket | Chamarra | Куртка | Куртка | — | Mexico "chamarra" (Spain "chaqueta"). |
| rain jacket | Impermeable | Дождевик | Дощовик | — |  |
| hat (winter) | Gorro | Шапка | Шапка | — | es "sombrero" is a brimmed hat; "gorra" is a cap. |
| gloves | Guantes | Перчатки | Рукавички | — | uk "рукавички", not "перчатки". Mittens: "manoplas", "варежки", "рукавиці". |
| scarf | Bufanda | Шарф | Шарф | — |  |
| boots | Botas | Сапоги | Чоботи | — | uk "чоботи", not "сапоги". |
| T-shirt | Playera | Футболка | Футболка | — | Mexico "playera" (Spain "camiseta"). |
| shorts | Shorts | Шорты | Шорти | — | Mexico says "shorts". |
| Dress for … weather (tier words) | helado, muy frío, frío, fresco, templado, caluroso | очень холодно, холодно, прохладно, свежо, тепло, жарко | дуже холодно, холодно, прохолодно, свіжо, тепло, спекотно | — | Tiers very cold, cold, chilly, cool, mild, warm (widgets/weather/index.html:603-610). The sentence is built; translate each whole sentence, e.g. "Hace frío. Ponte el abrigo.", "Холодно. Надень куртку.", "Холодно. Одягни куртку." |

### Games and traffic light

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| die; dice | dado; dados | кубик; кубики | кубик; кубики | — | ru "игральные кости" is formal; kids say "кубик". "Number of dice": "Número de dados", "Количество кубиков", "Кількість кубиків". |
| roll (button) | Lanzar | Бросить | Кинути | — | es "Tirar" is also common; "Lanzar" avoids the "throw away" sense. uk "Кинути", not "Бросити". |
| total (dice sum) | Suma; total | Сумма | Сума | ADM3-ES p3 | uk has one м. Amplify: "cantidad total". |
| shuffle | Mezclar | Перемешать | Перемішати | — | Name Picker "Shuffle again": "Mezclar otra vez", "Перемешать снова", "Перемішати знову". |
| red | rojo | красный | червоний | NL-2023-10-ES p5, NL-2023-10-RU p5, NL-2023-10-UK p5 | uk "червоний"; "красний" means beautiful in old Ukrainian. |
| yellow | amarillo | жёлтый | жовтий | NL-2023-10-ES p5, NL-2023-10-RU p5, NL-2023-10-UK p5 | Write ё in ru for children (HB-RU p5 writes "ребёнку"). es "amarillo", not Spain's "ámbar". |
| green | verde | зелёный | зелений | — |  |
| blue | azul | синий | синій | — | Zones blue is "синий/синій", not light blue "голубой/блакитний". |
| traffic light | semáforo | светофор | світлофор | — |  |
| red / yellow / green light | luz roja / amarilla / verde | красный / жёлтый / зелёный свет | червоне / жовте / зелене світло | — | ru "свет" is masculine; uk "світло" is neuter. The Traffic Light shows no words in the window. |
| stop / slow / go | Alto / Despacio / Siga | Стоп / Медленно / Иди | Стоп / Повільно / Іди | COBB-ES p2 | Mexican stop signs say "ALTO" (COBB-ES p2 "ALTO/PARE", "LENTO"). The children's game is "Luz roja, luz verde". "Вперёд"/"Вперед" also work for go. |

### Calculator and math

| English | Español (MX/US) | Русский | Українська | Source | Note |
| --- | --- | --- | --- | --- | --- |
| plus; add | más; sumar | плюс; сложить | плюс; додати | ADM3-ES p19 | Spoken operators: widgets/calculator/calc-engine.js:612. Read "3 + 4" as "3 más 4", "3 плюс 4", "3 плюс 4". Amplify: "la suma, la resta y la multiplicación". |
| minus; subtract | menos; restar | минус; вычесть | мінус; відняти | ADM3-ES p19, ADM4-ES p22 |  |
| times; multiply | por; multiplicar | умножить на; умножить | помножити на; помножити | ADM3-ES p1 | "3 × 4": "3 por 4", "3 умножить на 4", "3 помножити на 4". |
| divided by; divide | entre; dividir | разделить на; разделить | поділити на; поділити | ADM3-ES p1 | "12 ÷ 3": "12 entre 3" (Mexican school usage), "12 разделить на 3", "12 поділити на 3". Keep ÷ and × on screen; ru/uk schools use ":" and "·", but Tyler wants English math rules. |
| equals | es igual a | равно | дорівнює | — | "3 + 4 = 7": "3 más 4 es igual a 7", "3 плюс 4 равно 7", "3 плюс 4 дорівнює 7". uk never "рівно". |
| remainder | residuo | остаток | остача | — | Mexico's textbooks say "residuo"; ADM3-ES uses "resto" only as "the rest" (p18). Russian/Ukrainian school notation is "3 (ост. 2)"; the US "3 R 2" may stay as is in an American classroom. uk "остача", never "остаток". |
| quotient | cociente | частное | частка | ADM3-ES p4 |  |
| answer | respuesta | ответ | відповідь | ADM3-ES p4 | uk "відповідь", never "ответ". |
| fraction | fracción | дробь | дріб | ADM4-ES p3 | "Show as a fraction" is a menu label; menus stay English (Tyler). |
| mixed number | número mixto | смешанное число | мішане число | ADM4-ES p3 |  |
| decimal | decimal; número decimal | десятичная дробь | десятковий дріб | ADM4-ES p3 | The board writes "3.5" in every language (Tyler). Mexico already uses the point; ru/uk schools write "3,5". Read aloud "3.5": es "3 punto 5"; ru/uk have no "point" reading (school form "три целых пять десятых"), so spoken decimals need a rule (calc-engine.js:1098 names the key "point"). |
| tenths | décimas | десятые | десяті | ADM4-ES p3 |  |
| percent | por ciento; porcentaje | процент | відсоток | — | ru 1 процент, 2 процента, 5 процентов; uk 1 відсоток, 2 відсотки, 5 відсотків. uk never "процент". |
| square root | raíz cuadrada | квадратный корень | квадратний корінь | — | "√9" read aloud (calc-engine.js:771 "the square root of"): "la raíz cuadrada de 9", "квадратный корень из 9", "квадратний корінь з 9". |
| pi | pi | пи | пі | — | The π sign stays. |
| negative | menos; negativo | минус | мінус | — | calc-engine.js:750 says "negative 5". Read as "menos 5", "минус 5", "мінус 5". The adjective: "negativo", "отрицательное", "від’ємне". |
| equation | ecuación | уравнение | рівняння | ADM3-ES p4 | Amplify labels "ecuación:" and "respuesta:" on student pages. |
| expression | expresión | выражение | вираз | ADM3-ES p3 |  |
| number | número | число | число | ADM3-ES p3 | ru/uk "цифра" means a digit only. |
| all clear (AC key) | Borrar todo | Очистить всё | Очистити все | — | Key name at calc-engine.js:1104. The key keeps its "AC" label. |
<!-- /glossary:words -->

## What we couldn't find

- **The current handbooks.** ccsd21.org/handbook/ links 2025-26 handbooks per school in English, Spanish,
  Russian, and Ukrainian, but only as FlipHTML5 flipbooks (online.fliphtml5.com/ccsd21/…). Their text sits
  behind an encrypted config, and decoding it meant running the viewer's code, which wasn't allowed. So there is no Ukrainian handbook text here at all, and the Spanish and Russian
  handbook rows come from the 2016-17 PDFs.
- **Any district text written for students.** Every CCSD21 document is for families. The "you" choice for
  children rests on Amplify (Spanish) and common practice (Russian, Ukrainian).
- **Classroom-board words in district documents.** No CCSD21 use of timer, stopwatch, lap, record, dice,
  roll, feelings or Zones words, traffic light words, line up, clean up, or weather words beyond weather,
  snow, cold, and temperature. Those rows are marked "—".
- **Russian and Ukrainian math words.** Amplify has no Russian or Ukrainian editions. The math rows in
  ru/uk are standard school terms. Amplify's two units never say "remainder" ("residuo") or "percent".
- **Spanish and English fee waiver PDFs.** Cloudflare refused them (403) after retries. The Polish one was not
  tried. The Russian one was read.
- **Newsletters from 2024-25 on.** They're Smore pages labeled English only. Not opened in other languages.
- **Zones of Regulation in Russian or Ukrainian.** No source found. The Spanish rows lean on two non-CCSD21
  handouts (Cobb County, Boston Medical Center).
- **A district glossary or style guide** for translators. The Language Services pages
  (https://ccsd21.org/educational-services/) list staff, not resources.

## Open questions

- The Calculator's spoken text (calc-engine.js:612 operators, :771 square root, :1097-1111 key names) needs
  a reader per language, not a word table. Russian and Ukrainian cases change with each number, and a decimal has
  no "point" reading in either.
- "3 R 2" or "3 (ост. 2)" for remainders in Russian and Ukrainian.
