#!/usr/bin/env python3
# Builds tools/glossary.json and the tables of docs/GLOSSARY.md from one list, the add() lines below.
#
#   python3 tools/make-glossary.py     after changing the list. Prints the number of entries.
#
# It rewrites only what sits between the marker comments in docs/GLOSSARY.md: the legend and the words. No
# dependencies.
import json, os, re

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GD = 'https://drive.google.com/file/d/%s/view'
SRC = {
  'CAL-EN': 'https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-ENG.pdf',
  'CAL-ES': 'https://ccsd21.org/wp-content/uploads/2026/04/2026-2027-Academic-Calendar-SPA-1.pdf',
  'CAL-RU': 'https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-RUS.pdf',
  'CAL-UK': 'https://ccsd21.org/wp-content/uploads/2026/02/2026-2027-Academic-Calendar-UKR.pdf',
  'HB-ES': 'https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookSpanish.pdf',
  'HB-RU': 'https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookRussian.pdf',
  'HB-EN': 'https://ccsd21.org/wp-content/uploads/2017/04/1617ParentStudentHandbookEnglish.pdf',
  'FEE-RU': 'https://ccsd21.org/wp-content/uploads/2026/07/FY27-CEP-Fee-Waiver-Letter-and-Application-RUSSIAN.pdf',
  'NL-2023-10-ES': GD % '1kF_RBmMaYG7osDDYSBVjl7au_G3iJ5em',
  'NL-2023-10-RU': GD % '1UA0htY37lz7dwua55YO33E-od4WvlykI',
  'NL-2023-10-UK': GD % '16jX2LXH6mrKVl5c2JmJ44TH_0A0i4r1i',
  'NL-2023-11-ES': GD % '17ADNXzXwmDAS8jFyPTUXV00yYdLogeH4',
  'NL-2023-11-UK': GD % '1COeb0xeArWg8skd7uLt1Ban-vZYiLDhn',
  'NL-2023-12-RU': GD % '1o_ofticGT58XTEfj5ssaJLA_6KL1bpNw',
  'NL-2023-12-UK': GD % '1C16oXBtffp_afW8qa9nsTeXULkOtuxOO',
  'NL-2024-01-ES': GD % '1BZh_BBiQDrKcqEksTkADQ7QDHOAK-55x',
  'NL-2024-01-UK': GD % '1ASmp2DPmkEc8FYFAI-wAEj-nVdsaymNy',
  'NL-2024-02-ES': GD % '1LqJ11Fl9dbgR5j-PHqfysWoc9sYM3sSJ',
  'NL-2024-02-RU': GD % '1UKCq9-hWT09FSm677AX89PzhM6mSJYgB',
  'NL-2024-02-UK': GD % '1TKC-Q0BDE2JSqeIQs3E0C5CmSuWVBugW',
  'NL-2024-04-ES': GD % '1UHR9tPrdgNOdg8Phk4IenSpU0bmsDwIM',
  'NL-2024-04-RU': GD % '1jE_uQy8gLoP_P-d9m7D9LD4GkW7BtFYf',
  'ADM3-ES': 'https://amplify.com/wp-content/uploads/2025/09/ADM-3-4-caregiver-unit-overview-1E-ES.pdf',
  'ADM4-ES': 'https://amplify.com/wp-content/uploads/2025/09/ADM-4-4-caregiver-unit-overview-1E-ES.pdf',
  'AIRNOW-ES': 'https://www.airnow.gov/aqi/aqi-basics-in-spanish/',
  'COBB-ES': 'https://media.cobbk12.org/media/WWWCobb/medialib/zonesofregulation_parentresource_english-spanish_spanishrevised.1a4a16134473.pdf',
  'BMC-ES': 'https://www2.bmc.org/sites/default/files/Patient_Care/Specialty_Care/Pediatrics%20-%20Autism/resources/Zonas%20de%20regulaci%C3%B3n%20emocional.pdf',
}
SRC_DESC = {
  'CAL-EN': 'CCSD21 2026-27 academic calendar, English (2 pages)',
  'CAL-ES': 'CCSD21 2026-27 academic calendar, Spanish (2 pages, human translation)',
  'CAL-RU': 'CCSD21 2026-27 academic calendar, Russian (2 pages, human but careless)',
  'CAL-UK': 'CCSD21 2026-27 academic calendar, Ukrainian (2 pages, good human translation)',
  'HB-ES': 'CCSD21 Parent-Student Handbook 2016-17, Spanish (53 pages, human translation)',
  'HB-RU': 'CCSD21 Parent-Student Handbook 2016-17, Russian (51 pages, human translation)',
  'HB-EN': 'CCSD21 Parent-Student Handbook 2016-17, English',
  'FEE-RU': 'CCSD21 FY27 fee waiver letter and application, Russian (3 pages)',
  'NL-*': 'CCSD21 Family Newsletter, 2023-24, Google Drive PDFs (machine translated; weak evidence)',
  'ADM3-ES': 'Amplify Desmos Math, grade 3 unit 4 caregiver overview, Spanish (29 pages)',
  'ADM4-ES': 'Amplify Desmos Math, grade 4 unit 4 caregiver overview, Spanish (29 pages)',
  'AIRNOW-ES': 'EPA AirNow, AQI basics in Spanish (US government)',
  'COBB-ES': 'Cobb County (GA) schools, Zones of Regulation parent resource, English-Spanish (not CCSD21)',
  'BMC-ES': 'Boston Medical Center, Zonas de regulación emocional, 2015 (not CCSD21)',
}

NONE = 'none (no CCSD21 or Amplify use found; standard usage)'

G = []
def add(cat, en, es, ru, uk, src, note):
    G.append(dict(cat=cat, en=en, es=es, ru=ru, uk=uk, src=src, note=note))

C = 'School and people'
add(C, 'school', 'escuela', 'школа', 'школа', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'],
    'Calendars: "Escuela Primaria", "Начальная школа", "Початкова школа".')
add(C, 'class (the group of students)', 'clase; grupo', 'класс', 'клас', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'],
    'Mexican teachers call their class "el grupo". A lesson is "clase" (es), "урок" or "занятие" (ru), "урок" or "заняття" (uk). ru/uk "класс/клас" also means grade.')
add(C, 'classroom', 'salón de clases', 'класс', 'клас; класна кімната', ['HB-ES p4', 'HB-RU p5'],
    'District: "en el salón de clases", "с учащимися в классе". "Aula" is Spain-leaning and formal; it shows up only in the machine-translated newsletter (NL-2023-11-ES p2).')
add(C, 'teacher', 'maestro; maestra', 'учитель; учительница', 'учитель; учителька', ['HB-ES p4', 'HB-RU p5', 'CAL-UK p1'],
    'Mexico says "maestro/maestra" in K-8, not "profesor". Ukrainian swaps у/в by sound: "Учитель" at the start, "до вчителя" after a vowel (CAL-UK p1 "вчительські").')
add(C, 'student', 'estudiante; alumno', 'ученик; ученица', 'учень; учениця', ['HB-ES p4', 'HB-RU p4', 'NL-2023-10-UK p2'],
    'District writes "estudiantes" (es) and formal "учащиеся" (ru). For K-8 kids use ru "ученик", uk "учень" (NL "учнів"). uk "студент" means a college student; the machine newsletters misuse it.')
add(C, 'homeroom teacher', 'maestro del salón', 'классный руководитель', 'класний керівник', ['HB-ES p4', 'HB-RU p5'],
    'Both from the handbook sign-off form.')
add(C, 'friend', 'amigo; amiga', 'друг; подруга', 'друг; подруга', ['ADM3-ES p3'],
    'Zones idea "Help a friend": "Ayuda a un amigo", "Помоги другу", "Допоможи другові".')
add(C, 'group', 'grupo', 'группа', 'група', ['CAL-ES p2', 'CAL-RU p2', 'NL-2023-12-UK p7'],
    'Plurals: ru 1 группа, 2 группы, 5 групп; uk 1 група, 2 групи, 5 груп. "Make 3 groups": "Hacer 3 grupos", "Сделать 3 группы", "Створити 3 групи".')
add(C, 'team', 'equipo', 'команда', 'команда', ['HB-ES p38', 'HB-RU p12', 'NL-2023-10-UK p2'],
    '"Deportes de equipo", "командных видах спорта".')
add(C, 'turn', 'turno', 'ход; очередь', 'хід; черга', [],
    '"Your turn": "Es tu turno", "Твой ход", "Твій хід". "Take turns": "Tomar turnos", "По очереди", "По черзі".')
add(C, 'winner', 'ganador; ganadora', 'победитель; победительница', 'переможець; переможниця', [],
    'Gendered in all three, and the board does not know a name\'s gender. Prefer a verb: "{name} wins" as "¡Gana {name}!", "Побеждает {name}!", "Перемагає {name}!". Ukrainian puts names in the vocative when you speak to someone ("Аню"); a name the teacher typed cannot be inflected, so avoid direct address with a name.')
add(C, 'name / names', 'nombre; nombres', 'имя; имени; имён', 'ім’я; імені; імен', [],
    'ru 1 имя, 2 имени, 5 имён; uk 1 ім’я, 2 імені, 5 імен. "Pick a name": "Elegir un nombre", "Выбрать имя", "Вибрати ім’я".')
add(C, 'grade (school level)', 'grado', 'класс', 'клас', ['CAL-ES p2', 'ADM3-ES p1', 'CAL-RU p2', 'CAL-UK p2'],
    'Ordinals: es "3.er grado", "2.º grado" (Amplify style); ru "3-й класс"; uk "3-й клас". District: "Grados 1-8", "1-8 классы", "1–8 класи".')
add(C, 'kindergarten', 'kínder', 'подготовительный класс', 'підготовчий клас', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'],
    'District es writes "Kinder" (RAE: "kínder"). CAL-RU keeps the English word "Kindergarten". CAL-UK says "дитячий садок", which means daycare. On the board, "K" works in all four.')
add(C, 'preschool / Pre-K', 'preescolar', 'Pre-K', 'Pre-K', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'],
    'ru/uk calendars keep "Pre-K" in Latin letters (CAL-RU also writes "Пре-K").')
add(C, 'parents / guardians', 'padres; tutores', 'родители; опекуны', 'батьки; опікуни', ['HB-ES p10', 'HB-RU p10', 'NL-2023-11-UK p3'],
    'District: "padres/tutores", "родителям или опекунам", "батьків/опікунів". uk "батьки" is plural only.')

C = 'Time and schedule'
add(C, 'schedule', 'horario', 'расписание', 'розклад', ['CAL-ES p1', 'CAL-UK p1'],
    'Calendars: "HORARIO ESCOLAR", "РОЗКЛАД НАВЧАЛЬНОГО ДНЯ". CAL-RU p1 says "УЧЕБНЫЕ ЧАСЫ" (school hours).')
add(C, 'day / days', 'día; días', 'день; дня; дней', 'день; дні; днів', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'],
    'ru 1 день, 2 дня, 5 дней; uk 1 день, 2 дні, 5 днів.')
add(C, 'week', 'semana', 'неделя', 'тиждень', ['HB-ES p4', 'HB-RU p5', 'NL-2023-10-UK p2'],
    'False friend: uk "неділя" means Sunday. Never write "неделя" in Ukrainian.')
add(C, 'today', 'hoy', 'сегодня', 'сьогодні', ['NL-2023-10-ES p4', 'NL-2023-10-RU p4', 'NL-2023-10-UK p4'], '')
add(C, 'tomorrow', 'mañana', 'завтра', 'завтра', [], 'es "mañana" also means "morning".')
add(C, 'yesterday', 'ayer', 'вчера', 'учора', [], 'uk "учора" and "вчора" are both standard; use "Учора" at the start of a label.')
add(C, 'now', 'ahora', 'сейчас', 'зараз', [], 'Weather "Now" column. uk "зараз", never "сейчас".')
add(C, 'morning', 'mañana; por la mañana', 'утро; утром', 'ранок; вранці', ['CAL-ES p2', 'CAL-UK p2'],
    'Greeting: "Buenos días", "Доброе утро", "Доброго ранку". CAL-ES p2 "Clases solo por la Mañana". CAL-UK p2 writes "до обіду" (before lunch) for AM.')
add(C, 'afternoon', 'tarde; por la tarde', 'день; после обеда', 'день; після обіду', ['CAL-UK p2'],
    'Greeting: "Buenas tardes", "Добрый день", "Добрий день". CAL-UK p2 "(після обіду)" for PM. CAL-RU p2 leaves "AM" and "PM" in English.')
add(C, 'a.m. / p.m.', 'a. m.; p. m.', 'AM; PM', 'AM; PM', ['CAL-ES p1', 'NL-2023-10-ES p6', 'CAL-RU p1', 'CAL-UK p1'],
    'Mexico uses the 12-hour clock with "a. m./p. m." (NL: "9:30 a. m. a 2:45 p. m."; CAL-ES p1 leaves "9 a.m. to 3:30 p.m." in English). ru/uk have no AM/PM; their calendars use 24-hour time ("c 0900 до 1530", "9:00 – 15:30"). Open question for the Clock. An American classroom suggests a 12-hour face in every language, with "AM/PM" kept in Latin letters for ru/uk as CAL-RU p2 does.')
add(C, 'hour / hours', 'hora; horas', 'час; часа; часов', 'година; години; годин', ['HB-ES p15', 'HB-RU p9', 'NL-2023-11-UK p6'],
    'ru/uk need four plural forms: one (1, 21), few (2-4), many (5-20, 0), other (1.5): ru час/часа/часов/часа, uk година/години/годин/години. Short: "h", "ч", "год". uk "час" means time and "годинник" means clock.')
add(C, 'minute / minutes', 'minuto; minutos', 'минута; минуты; минут', 'хвилина; хвилини; хвилин', ['NL-2024-02-ES p4', 'NL-2024-02-RU p4', 'NL-2024-02-UK p4'],
    'After "for" ru/uk take the accusative: "1 минуту", "1 хвилину" ("Sit quietly for 2 minutes": "Siéntate en silencio 2 minutos", "Посиди тихо 2 минуты", "Посидь тихо 2 хвилини"). Other (1.5): "минуты", "хвилини". Short: "min", "мин", "хв" (uk is not "мин").')
add(C, 'second / seconds', 'segundo; segundos', 'секунда; секунды; секунд', 'секунда; секунди; секунд', [],
    'Short: "s", "с", "с". Same four plural slots as minute.')
add(C, 'timer', 'temporizador', 'таймер', 'таймер', [],
    'Apple es-MX Clock says "Temporizador". "Cronómetro" is the stopwatch.')
add(C, 'stopwatch', 'cronómetro', 'секундомер', 'секундомір', [], 'uk "секундомір", not "секундомер".')
add(C, 'clock', 'reloj', 'часы', 'годинник', [], 'ru "часы" is plural only. uk "годинник" (not "часи").')
add(C, 'calendar', 'calendario', 'календарь', 'календар', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'], '')
add(C, 'start (button)', 'Iniciar', 'Старт', 'Старт', [],
    'Plain "begin": "Empezar", "Начать", "Почати". Buttons: Spanish infinitive; ru/uk a noun or infinitive, as phone clock apps do.')
add(C, 'stop (button)', 'Detener', 'Стоп', 'Стоп', [], 'A shouted "Stop!" in a game or on a sign is es "¡Alto!" (see stop/slow/go).')
add(C, 'pause', 'Pausar', 'Пауза', 'Пауза', [], 'The title bar status "Paused" stays English (answers.md Q1).')
add(C, 'resume', 'Reanudar', 'Продолжить', 'Продовжити', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'],
    'Button words above. The calendars\' "classes resume" is "Regreso a Clases", "Уроки начинаются снова", "Відновлення занять".')
add(C, 'reset', 'Restablecer', 'Сбросить', 'Скинути', [],
    'es "Reiniciar" means restart; Apple es-MX stopwatch uses "Restablecer". uk "Скинути", not "Сбросить".')
add(C, 'undo', 'Deshacer', 'Отменить', 'Скасувати', [],
    'uk "Скасувати" is also "Cancel"; if both sit on one screen, make Cancel "Закрити" or rephrase. Avoid "Відмінити" (a Russism in this sense).')
add(C, 'cancel', 'Cancelar', 'Отмена', 'Скасувати', [], '')
add(C, 'start over', 'Empezar de nuevo', 'Начать заново', 'Почати знову', [], 'Name Picker and Zones "Start over".')
add(C, 'next', 'Siguiente', 'Далее; следующий', 'Далі; наступний', ['HB-ES p15', 'HB-RU p15', 'NL-2023-10-UK p5'],
    'Button: "Siguiente", "Далее", "Далі". Adjective: "el próximo año", "следующий учебный год", "наступного тижня". uk never "следующий".')
add(C, 'previous', 'Anterior', 'Назад; предыдущий', 'Назад; попередній', [],
    '"Previous month": "Mes anterior", "Предыдущий месяц", "Попередній місяць".')
add(C, 'done; finished', '¡Listo!; terminado', 'Готово!', 'Готово!', [],
    '"All done!": "¡Todo listo!", "Всё готово!", "Усе готово!".')
add(C, 'ready', 'listo; lista', 'готов; готова', 'готовий; готова', ['BMC-ES p1'],
    'Gendered. Zones "Ready to Learn": "Listo para aprender" (BMC-ES p1); ru/uk gender-free nouns "Готовность учиться", "Готовність учитися".')
add(C, 'time\'s up', '¡Se acabó el tiempo!', 'Время вышло!', 'Час сплив!', [],
    'uk "Час сплив" is the native idiom; "Час вийшов" copies Russian.')
add(C, 'almost done (time nearly up)', 'Queda poco tiempo', 'Осталось немного', 'Залишилося трохи', [], 'Timer warning: the time, not a task, is nearly up. Title bar stays English (Q1).')
add(C, 'lap', 'vuelta', 'круг', 'коло', [], '"Lap 3": "Vuelta 3", "Круг 3", "Коло 3". "Fastest lap": "Vuelta más rápida", "Самый быстрый круг", "Найшвидше коло".')
add(C, 'record; best time', 'récord; mejor tiempo', 'рекорд; лучшее время', 'рекорд; найкращий час', [],
    '"New record": "¡Nuevo récord!", "Новый рекорд!", "Новий рекорд!". uk "найкращий", not "лучший".')
add(C, 'total (time)', 'total', 'всего', 'усього', ['ADM3-ES p3'],
    'Stopwatch "Total" beside a lap time. Dice total is "Suma"/"Сумма"/"Сума" (see Games).')
add(C, 'holiday (no school)', 'día festivo (no hay clases)', 'праздник (школы нет)', 'свято (занять немає)', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'],
    'Calendar legends: "Día Festivo (No hay Clases)", "праздничный день (Школы нет)", "Свято (занять немає)". Write Spanish in sentence case, not the calendar\'s Title Case.')
add(C, 'first day of school', 'primer día de clases', 'первый день занятий', 'перший день навчання', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'], '')
add(C, 'break (days off)', 'vacaciones', 'каникулы', 'канікули', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p1'],
    '"Winter break": "Vacaciones de invierno", "Зимние каникулы", "Зимові канікули". ru/uk are plural only (CAL-RU p1 "осенний каникул" is a grammar error).')
add(C, 'school year', 'año escolar', 'учебный год', 'навчальний рік', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], '')

C = 'Weekdays'
WD = [
 ('Sunday', 'domingo (dom)', 'воскресенье (Вс)', 'неділя (Нд)', [], 'Not on the district calendar (school days only). US and Mexican calendars start on Sunday; Russian and Ukrainian ones start on Monday.'),
 ('Monday', 'lunes (lun)', 'понедельник (Пн)', 'понеділок (Пн)', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], 'Weekdays are lowercase mid-sentence in all three. The ru/uk calendars use made-up headers ("ПО В С Ч ПЯ", "ПО В С Ч П\'"); use the standard two-letter forms shown.'),
 ('Tuesday', 'martes (mar)', 'вторник (Вт)', 'вівторок (Вт)', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], ''),
 ('Wednesday', 'miércoles (mié)', 'среда (Ср)', 'середа (Ср)', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], ''),
 ('Thursday', 'jueves (jue)', 'четверг (Чт)', 'четвер (Чт)', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], ''),
 ('Friday', 'viernes (vie)', 'пятница (Пт)', 'п’ятниця (Пт)', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], 'uk apostrophe is ’ (U+2019), as CAL-UK p2 "п’ятниця".'),
 ('Saturday', 'sábado (sáb)', 'суббота (Сб)', 'субота (Сб)', [], 'uk "субота" has one б.'),
]
for en, es, ru, uk, s, n in WD: add(C, en, es, ru, uk, s, n)

C = 'Months'
MO = [
 ('January', 'enero', 'январь', 'січень', 'января', 'січня'),
 ('February', 'febrero', 'февраль', 'лютий', 'февраля', 'лютого'),
 ('March', 'marzo', 'март', 'березень', 'марта', 'березня'),
 ('April', 'abril', 'апрель', 'квітень', 'апреля', 'квітня'),
 ('May', 'mayo', 'май', 'травень', 'мая', 'травня'),
 ('June', 'junio', 'июнь', 'червень', 'июня', 'червня'),
 ('July', 'julio', 'июль', 'липень', 'июля', 'липня'),
 ('August', 'agosto', 'август', 'серпень', 'августа', 'серпня'),
 ('September', 'septiembre', 'сентябрь', 'вересень', 'сентября', 'вересня'),
 ('October', 'octubre', 'октябрь', 'жовтень', 'октября', 'жовтня'),
 ('November', 'noviembre', 'ноябрь', 'листопад', 'ноября', 'листопада'),
 ('December', 'diciembre', 'декабрь', 'грудень', 'декабря', 'грудня'),
]
for i, (en, es, ru, uk, rug, ukg) in enumerate(MO):
    n = 'In a date: "19 de %s", "19 %s", "19 %s".' % (es, rug, ukg)
    if i == 0:
        n += ' Month names are lowercase in all three except at the start of a header. Ukrainian names share nothing with Russian. CAL-RU p2 writes "Август 19" (English order); don\'t copy it. Intl gives ru "январь 2027 г." and uk "січень 2027 р."; capitalize the first letter for a header.'
    add(C, en, es, ru, uk, ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'], n)

C = 'Seasons'
add(C, 'fall; autumn', 'otoño', 'осень', 'осінь', ['CAL-ES p1', 'CAL-RU p1', 'CAL-UK p1'], 'First/Then themes. Calendars: "Vacaciones otoño", "осенний", "Осінні канікули".')
add(C, 'winter', 'invierno', 'зима', 'зима', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], '')
add(C, 'spring', 'primavera', 'весна', 'весна', ['CAL-ES p2', 'CAL-RU p2', 'CAL-UK p2'], '')
add(C, 'summer', 'verano', 'лето', 'літо', [], '')

C = 'Class activities and subjects'
add(C, 'activity', 'actividad', 'занятие', 'заняття', ['HB-ES p6', 'CAL-RU p1', 'CAL-UK p1'],
    'ru "мероприятие" means an event; a class activity is "занятие".')
add(C, 'first / then', 'Primero / Después', 'Сначала / Потом', 'Спочатку / Потім', [],
    'Standard first-then board words in each language. The widget\'s CSS makes them capitals.')
add(C, 'break (short rest)', 'descanso', 'перерыв', 'перерва', [], 'Keep apart from recess in uk (see next row).')
add(C, 'recess', 'recreo', 'перемена', 'велика перерва', ['HB-ES p40', 'NL-2024-02-RU p5', 'NL-2024-02-UK p5'],
    'HB-ES p40 "Educación Física/Recreo". HB-RU p39 drops recess. The machine newsletters say "перемен", "перерв". Russian and Ukrainian schools have no recess; "перемена" is the break between lessons. uk "велика перерва" (the long break) keeps it apart from "перерва".')
add(C, 'lunch', 'almuerzo', 'обед', 'обід', ['HB-ES p6', 'HB-RU p7', 'NL-2024-02-UK p5'],
    '"Programa de desayuno y almuerzo", "Программа завтрака и обеда". Mexican kids also say "lonche".')
add(C, 'snack', 'refrigerio', 'перекус', 'перекус', [],
    'Mexican school word "refrigerio". "Merienda" is an afternoon snack; "bocadillo" is a sandwich in Spain.')
add(C, 'reading', 'lectura', 'чтение', 'читання', ['HB-ES p3', 'HB-RU p4', 'NL-2023-12-UK p4'], '')
add(C, 'writing', 'escritura', 'письмо', 'письмо', ['ADM4-ES p14'], 'ru/uk "письмо" also means a letter.')
add(C, 'math', 'matemáticas', 'математика', 'математика', ['HB-ES p3', 'HB-RU p4', 'NL-2024-02-UK p4'], '')
add(C, 'science', 'ciencias', 'естествознание', 'природознавство', ['NL-2024-04-ES p4', 'NL-2024-04-RU p4'],
    'NL: "Evaluación de ciencias", "естественных наук". ru "наука" alone is wrong for the school subject. For middle school "естественные науки", "природничі науки".')
add(C, 'art', 'arte', 'рисование', 'малювання', [],
    'K-5 art class is drawing class in ru/uk. Middle school: "ИЗО", "образотворче мистецтво". "Art & coloring": "Arte y colorear", "Рисование и раскраски", "Малювання й розмальовки".')
add(C, 'music', 'música', 'музыка', 'музика', ['NL-2023-12-RU p2'], '"Music class": "Clase de música", "Урок музыки", "Урок музики".')
add(C, 'PE; gym', 'educación física; gimnasio', 'физкультура; спортзал', 'фізкультура; спортзал', ['HB-ES p40', 'HB-RU p39', 'NL-2023-10-UK p6', 'NL-2023-11-ES p4', 'NL-2023-11-UK p4'],
    'Class: "educación física", "физкультура" (HB-RU p39), "фізкультура". Room: "gimnasio", "спортзал".')
add(C, 'library', 'biblioteca', 'библиотека', 'бібліотека', ['NL-2023-10-ES p6', 'NL-2023-10-RU p6', 'NL-2023-10-UK p6'], '')
add(C, 'clean up', 'Recoger', 'Уборка', 'Прибирання', [], 'Mexican teachers: "¡A recoger!". "Limpiar" means to wipe clean.')
add(C, 'line up', 'Hacer fila', 'Построиться', 'Шикуватися', [], 'Mexican classrooms say "Formarse" ("¡Fórmense!"); "hacer fila" is understood everywhere.')
add(C, 'quiet', 'silencio', 'тишина', 'тиша', [],
    '"Quiet corner": "Rincón tranquilo", "Тихий уголок", "Тихий куточок". "Calm corner": "Rincón de la calma", "Уголок спокойствия", "Куточок спокою".')
add(C, 'listen', 'escuchar', 'слушать', 'слухати', [], 'uk "слухати", not "слушати".')
add(C, 'wash hands', 'Lavarse las manos', 'Помыть руки', 'Помити руки', [], '')
add(C, 'bathroom', 'baño', 'туалет', 'туалет', [], 'Mexico "baño"; "sanitario" is formal signage.')
add(C, 'computer', 'computadora', 'компьютер', 'комп’ютер', ['HB-ES p28', 'HB-RU p28', 'NL-2023-11-UK p6'],
    'Mexico/US "computadora" (Spain "ordenador"). Keep "Chromebook" and "iPad" in Latin letters, as the district does (NL-2023-11-UK p6).')
add(C, 'cell phone', 'celular', 'мобильный телефон', 'мобільний телефон', ['HB-ES p30', 'HB-RU p30', 'COBB-ES p2'],
    'HB-ES p30 used Spain\'s "teléfonos móviles"; Mexican/US Spanish says "celular" (COBB-ES p2).')
add(C, 'language', 'idioma', 'язык', 'мова', [], 'uk "мова", never "язик" (that is the tongue). Menu names stay English (Tyler).')

C = 'Feelings (Zones of Regulation)'
add(C, 'Zones of Regulation', 'Zonas de Regulación', 'Зоны регуляции', 'Зони регуляції', ['COBB-ES p2'],
    'Zone names: "Zona azul/verde/amarilla/roja"; "Синяя/Зелёная/Жёлтая/Красная зона"; "Синя/Зелена/Жовта/Червона зона". Feelings below follow widgets/zones-check-in/index.html:259-279.')
FE = [
 ('sad', 'Triste', 'Грусть', 'Сум', ['BMC-ES p1'], 'Adjectives if wanted: ru грустный/грустная, uk сумний/сумна.'),
 ('tired', 'Cansado', 'Усталость', 'Втома', ['BMC-ES p1'], ''),
 ('sick', 'Enfermo', 'Болею', 'Хворію', ['BMC-ES p1'], 'ru/uk first-person verbs are gender-free.'),
 ('slow', 'Lento', 'Вялость', 'Млявість', [], 'The turtle chip.'),
 ('ready to learn', 'Listo para aprender', 'Готовность учиться', 'Готовність учитися', ['BMC-ES p1'], ''),
 ('calm', 'Tranquilo', 'Спокойствие', 'Спокій', ['BMC-ES p1'], 'Mexico "tranquilo"; "calmado" is fine too.'),
 ('happy', 'Feliz', 'Радость', 'Радість', [], 'BMC-ES p1 also lists "Contento".'),
 ('elevated', 'Acelerado', 'Много энергии', 'Багато енергії', [], 'Avoid es "excitado", ru "возбуждение", uk "збудження": all carry a sexual sense.'),
 ('silly', 'Juguetón', 'Дурачусь', 'Пустую', [], 'BMC-ES p1 says "Tonto", which means dumb; use "juguetón". Nouns if wanted: "Озорство", "Пустощі".'),
 ('frustrated', 'Frustrado', 'Досада', 'Досада', ['BMC-ES p1'], 'ru/uk "фрустрация/фрустрація" is clinical.'),
 ('angry', 'Enojado', 'Злость', 'Злість', ['BMC-ES p1'], 'Mexico "enojado" (Spain "enfadado").'),
 ('intense', 'Alterado', 'Напряжение', 'Напруга', [], 'es "intenso" describes a personality, not a feeling.'),
 ('overwhelmed', 'Abrumado', 'Перегрузка', 'Перевантаження', [], 'BMC-ES p1 also lists "Agobiado".'),
 ('worried', 'Preocupado', 'Тревога', 'Тривога', ['BMC-ES p1'], ''),
 ('excited', 'Emocionado', 'Восторг', 'Захват', [], 'Never es "excitado". BMC-ES p1 has "Entusiasmado".'),
]
for i, (en, es, ru, uk, s, n) in enumerate(FE):
    if i == 0:
        n = ('Pattern: Spanish adjectives in the masculine, as Mexican classroom posters do; ru/uk nouns, as Russian and Ukrainian emotion cards do. Nouns keep ru/uk free of gender, which the board cannot know. ' + n)
    add(C, en, es, ru, uk, s, n)
add(C, 'Drink water (an idea line)', 'Toma agua', 'Попей воды', 'Попий води', [],
    'Sample of the "you" form for one student: tú (es), ты (ru), ти (uk). Mexico "tomar agua" (Spain "beber").')
add(C, 'Take 3 deep breaths', 'Respira hondo 3 veces', 'Сделай 3 глубоких вдоха', 'Зроби 3 глибокі вдихи', [],
    'Numbers change the case: ru "3 глубоких вдоха", uk "3 глибокі вдихи".')
add(C, 'Talk to your teacher', 'Habla con tu maestro', 'Поговори с учителем', 'Поговори з учителем', [], 'es uses the masculine as the generic. The board can\'t know the teacher is a woman ("tu maestra").')
add(C, 'stress ball; fidget', 'pelota antiestrés', 'мячик-антистресс', 'м’ячик-антистрес', ['COBB-ES p4'], '"Use a fidget": "Usa un juguete antiestrés", "Возьми антистресс", "Візьми антистрес".')

C = 'Weather'
add(C, 'weather', 'clima; tiempo', 'погода', 'погода', ['HB-ES p49', 'NL-2024-01-ES p2', 'HB-RU p48', 'NL-2024-01-UK p2'],
    'Mexico/US say "el clima" for weather ("inclemencias del clima"); Spain says "el tiempo".')
WE = [
 ('sunny', 'Soleado', 'Солнечно', 'Сонячно', [], ''),
 ('clear (night)', 'Despejado', 'Ясно', 'Ясно', [], ''),
 ('mostly sunny', 'Mayormente soleado', 'Преимущественно солнечно', 'Переважно сонячно', [], 'uk "переважно", never "преимущественно".'),
 ('mostly clear', 'Mayormente despejado', 'Преимущественно ясно', 'Переважно ясно', [], ''),
 ('partly cloudy', 'Parcialmente nublado', 'Переменная облачность', 'Мінлива хмарність', [], ''),
 ('cloudy', 'Nublado', 'Облачно', 'Хмарно', [], 'uk "хмарно", not "облачно".'),
 ('fog', 'Niebla', 'Туман', 'Туман', [], ''),
 ('drizzle', 'Llovizna', 'Морось', 'Мряка', [], 'uk "мряка", not "морось".'),
 ('rain', 'Lluvia', 'Дождь', 'Дощ', [], ''),
 ('snow', 'Nieve', 'Снег', 'Сніг', ['CAL-ES p1', 'NL-2024-01-UK p5'], 'CAL-ES p1 "días de emergencia/nieve"; NL "снігові/надзвичайні дні".'),
 ('thunderstorms', 'Tormentas eléctricas', 'Гроза', 'Гроза', [], 'es "tormenta" alone is any storm.'),
 ('wind', 'Viento', 'Ветер', 'Вітер', [], ''),
 ('temperature', 'Temperatura', 'Температура', 'Температура', ['HB-RU p35'], ''),
 ('feels like', 'Sensación térmica', 'Ощущается как', 'Відчувається як', [], ''),
 ('high / low', 'Máxima / Mínima', 'Макс. / Мин.', 'Макс. / Мін.', [], 'uk "Мін." with і.'),
 ('sunrise', 'Salida del sol', 'Восход', 'Схід сонця', [], 'widgets/weather/index.html:1232.'),
 ('sunset', 'Puesta del sol', 'Закат', 'Захід сонця', [], 'uk "захід", not "закат".'),
]
for i, (en, es, ru, uk, s, n) in enumerate(WE):
    if i == 0: n = 'Condition words follow widgets/weather/index.html:1141-1142. ' + n
    add(C, en, es, ru, uk, s, n)
add(C, 'air quality', 'Calidad del aire', 'Качество воздуха', 'Якість повітря', ['AIRNOW-ES'],
    'AQI levels below agree with the noun: ru neuter (качество), uk feminine (якість). widgets/weather/index.html:1178-1183.')
AQ = [
 ('Good', 'Bueno', 'Хорошее', 'Добра'),
 ('Moderate', 'Moderado', 'Умеренное', 'Помірна'),
 ('Unhealthy for sensitive groups', 'Insalubre para grupos sensibles', 'Вредное для чувствительных групп', 'Шкідлива для чутливих груп'),
 ('Unhealthy', 'Insalubre', 'Вредное', 'Шкідлива'),
 ('Very unhealthy', 'Muy insalubre', 'Очень вредное', 'Дуже шкідлива'),
 ('Hazardous', 'Peligroso', 'Опасное', 'Небезпечна'),
]
for i, (en, es, ru, uk) in enumerate(AQ):
    add(C, 'air quality: ' + en, es, ru, uk, ['AIRNOW-ES'],
        'Spanish is EPA\'s own wording (its page prints "Insalubres" for red; singular is correct).' if i == 0 else '')
CL = [
 ('coat', 'Abrigo', 'Зимняя куртка', 'Зимова куртка', 'ru/uk "пальто" is a dress coat; kids wear a winter jacket.'),
 ('jacket', 'Chamarra', 'Куртка', 'Куртка', 'Mexico "chamarra" (Spain "chaqueta").'),
 ('rain jacket', 'Impermeable', 'Дождевик', 'Дощовик', ''),
 ('hat (winter)', 'Gorro', 'Шапка', 'Шапка', 'es "sombrero" is a brimmed hat; "gorra" is a cap.'),
 ('gloves', 'Guantes', 'Перчатки', 'Рукавички', 'uk "рукавички", not "перчатки". Mittens: "manoplas", "варежки", "рукавиці".'),
 ('scarf', 'Bufanda', 'Шарф', 'Шарф', ''),
 ('boots', 'Botas', 'Сапоги', 'Чоботи', 'uk "чоботи", not "сапоги".'),
 ('T-shirt', 'Playera', 'Футболка', 'Футболка', 'Mexico "playera" (Spain "camiseta").'),
 ('shorts', 'Shorts', 'Шорты', 'Шорти', 'Mexico says "shorts".'),
]
for i, (en, es, ru, uk, n) in enumerate(CL):
    if i == 0: n = 'What to wear: widgets/weather/index.html:602-610. ' + n
    add(C, en, es, ru, uk, [], n)
add(C, 'Dress for … weather (tier words)', 'helado, muy frío, frío, fresco, templado, caluroso',
    'очень холодно, холодно, прохладно, свежо, тепло, жарко', 'дуже холодно, холодно, прохолодно, свіжо, тепло, спекотно', [],
    'Tiers very cold, cold, chilly, cool, mild, warm (widgets/weather/index.html:603-610). The sentence is built; translate each whole sentence, e.g. "Hace frío. Ponte el abrigo.", "Холодно. Надень куртку.", "Холодно. Одягни куртку."')

C = 'Games and traffic light'
add(C, 'die; dice', 'dado; dados', 'кубик; кубики', 'кубик; кубики', [], 'ru "игральные кости" is formal; kids say "кубик". "Number of dice": "Número de dados", "Количество кубиков", "Кількість кубиків".')
add(C, 'roll (button)', 'Lanzar', 'Бросить', 'Кинути', [], 'es "Tirar" is also common; "Lanzar" avoids the "throw away" sense. uk "Кинути", not "Бросити".')
add(C, 'total (dice sum)', 'Suma; total', 'Сумма', 'Сума', ['ADM3-ES p3'], 'uk has one м. Amplify: "cantidad total".')
add(C, 'shuffle', 'Mezclar', 'Перемешать', 'Перемішати', [], 'Name Picker "Shuffle again": "Mezclar otra vez", "Перемешать снова", "Перемішати знову".')
add(C, 'red', 'rojo', 'красный', 'червоний', ['NL-2023-10-ES p5', 'NL-2023-10-RU p5', 'NL-2023-10-UK p5'], 'uk "червоний"; "красний" means beautiful in old Ukrainian.')
add(C, 'yellow', 'amarillo', 'жёлтый', 'жовтий', ['NL-2023-10-ES p5', 'NL-2023-10-RU p5', 'NL-2023-10-UK p5'],
    'Write ё in ru for children (HB-RU p5 writes "ребёнку"). es "amarillo", not Spain\'s "ámbar".')
add(C, 'green', 'verde', 'зелёный', 'зелений', [], '')
add(C, 'blue', 'azul', 'синий', 'синій', [], 'Zones blue is "синий/синій", not light blue "голубой/блакитний".')
add(C, 'traffic light', 'semáforo', 'светофор', 'світлофор', [], '')
add(C, 'red / yellow / green light', 'luz roja / amarilla / verde', 'красный / жёлтый / зелёный свет', 'червоне / жовте / зелене світло', [],
    'ru "свет" is masculine; uk "світло" is neuter. The Traffic Light shows no words in the window.')
add(C, 'stop / slow / go', 'Alto / Despacio / Siga', 'Стоп / Медленно / Иди', 'Стоп / Повільно / Іди', ['COBB-ES p2'],
    'Mexican stop signs say "ALTO" (COBB-ES p2 "ALTO/PARE", "LENTO"). The children\'s game is "Luz roja, luz verde". "Вперёд"/"Вперед" also work for go.')

C = 'Calculator and math'
add(C, 'plus; add', 'más; sumar', 'плюс; сложить', 'плюс; додати', ['ADM3-ES p19'],
    'Spoken operators: widgets/calculator/calc-engine.js:612. Read "3 + 4" as "3 más 4", "3 плюс 4", "3 плюс 4". Amplify: "la suma, la resta y la multiplicación".')
add(C, 'minus; subtract', 'menos; restar', 'минус; вычесть', 'мінус; відняти', ['ADM3-ES p19', 'ADM4-ES p22'], '')
add(C, 'times; multiply', 'por; multiplicar', 'умножить на; умножить', 'помножити на; помножити', ['ADM3-ES p1'], '"3 × 4": "3 por 4", "3 умножить на 4", "3 помножити на 4".')
add(C, 'divided by; divide', 'entre; dividir', 'разделить на; разделить', 'поділити на; поділити', ['ADM3-ES p1'],
    '"12 ÷ 3": "12 entre 3" (Mexican school usage), "12 разделить на 3", "12 поділити на 3". Keep ÷ and × on screen; ru/uk schools use ":" and "·", but Tyler wants English math rules.')
add(C, 'equals', 'es igual a', 'равно', 'дорівнює', [], '"3 + 4 = 7": "3 más 4 es igual a 7", "3 плюс 4 равно 7", "3 плюс 4 дорівнює 7". uk never "рівно".')
add(C, 'remainder', 'residuo', 'остаток', 'остача', [],
    'Mexico\'s textbooks say "residuo"; ADM3-ES uses "resto" only as "the rest" (p18). Russian/Ukrainian school notation is "3 (ост. 2)"; the US "3 R 2" may stay as is in an American classroom. uk "остача", never "остаток".')
add(C, 'quotient', 'cociente', 'частное', 'частка', ['ADM3-ES p4'], '')
add(C, 'answer', 'respuesta', 'ответ', 'відповідь', ['ADM3-ES p4'], 'uk "відповідь", never "ответ".')
add(C, 'fraction', 'fracción', 'дробь', 'дріб', ['ADM4-ES p3'], '"Show as a fraction" is a menu label; menus stay English (Tyler).')
add(C, 'mixed number', 'número mixto', 'смешанное число', 'мішане число', ['ADM4-ES p3'], '')
add(C, 'decimal', 'decimal; número decimal', 'десятичная дробь', 'десятковий дріб', ['ADM4-ES p3'],
    'The board writes "3.5" in every language (Tyler). Mexico already uses the point; ru/uk schools write "3,5". Read aloud "3.5": es "3 punto 5"; ru/uk have no "point" reading (school form "три целых пять десятых"), so spoken decimals need a rule (calc-engine.js:1098 names the key "point").')
add(C, 'tenths', 'décimas', 'десятые', 'десяті', ['ADM4-ES p3'], '')
add(C, 'percent', 'por ciento; porcentaje', 'процент', 'відсоток', [],
    'ru 1 процент, 2 процента, 5 процентов; uk 1 відсоток, 2 відсотки, 5 відсотків. uk never "процент".')
add(C, 'square root', 'raíz cuadrada', 'квадратный корень', 'квадратний корінь', [],
    '"√9" read aloud (calc-engine.js:771 "the square root of"): "la raíz cuadrada de 9", "квадратный корень из 9", "квадратний корінь з 9".')
add(C, 'pi', 'pi', 'пи', 'пі', [], 'The π sign stays.')
add(C, 'negative', 'menos; negativo', 'минус', 'мінус', [], 'calc-engine.js:750 says "negative 5". Read as "menos 5", "минус 5", "мінус 5". The adjective: "negativo", "отрицательное", "від’ємне".')
add(C, 'equation', 'ecuación', 'уравнение', 'рівняння', ['ADM3-ES p4'], 'Amplify labels "ecuación:" and "respuesta:" on student pages.')
add(C, 'expression', 'expresión', 'выражение', 'вираз', ['ADM3-ES p3'], '')
add(C, 'number', 'número', 'число', 'число', ['ADM3-ES p3'], 'ru/uk "цифра" means a digit only.')
add(C, 'all clear (AC key)', 'Borrar todo', 'Очистить всё', 'Очистити все', [], 'Key name at calc-engine.js:1104. The key keeps its "AC" label.')


# ---- output
def src_text(codes):
    if not codes: return NONE
    out = []
    for c in codes:
        code, _, page = c.partition(' ')
        out.append('%s %s (%s)' % (code, page, SRC[code]) if page else '%s (%s)' % (code, SRC[code]))
    return '; '.join(out)

data = [dict(en=g['en'], es=g['es'], ru=g['ru'], uk=g['uk'], source=src_text(g['src']), note=g['note']) for g in G]
with open(os.path.join(OUT, 'tools', 'glossary.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

def esc(s): return s.replace('|', '\\|')
md = []
cat = None
for g in G:
    if g['cat'] != cat:
        cat = g['cat']
        md += ['', '### ' + cat, '', '| English | Español (MX/US) | Русский | Українська | Source | Note |', '| --- | --- | --- | --- | --- | --- |']
    md.append('| %s | %s | %s | %s | %s | %s |' % tuple(esc(x) for x in (g['en'], g['es'], g['ru'], g['uk'], ', '.join(g['src']) or '—', g['note'])))
legend = ['| Code | Document | URL |', '| --- | --- | --- |']
for k in SRC:
    if k.startswith('NL-'): continue
    legend.append('| %s | %s | %s |' % (k, SRC_DESC[k], SRC[k]))
legend.append('| NL-YYYY-MM-LL | %s | One Drive file per month and language; full URL in tools/glossary.json |' % SRC_DESC['NL-*'])

# docs/GLOSSARY.md: each part between its markers, <!-- glossary:NAME --> and <!-- /glossary:NAME -->.
doc_path = os.path.join(OUT, 'docs', 'GLOSSARY.md')
with open(doc_path, encoding='utf-8') as f:
    doc = f.read()
for name, lines in (('legend', legend), ('words', md[1:])):
    start, end = '<!-- glossary:%s -->' % name, '<!-- /glossary:%s -->' % name
    if doc.count(start) != 1 or doc.count(end) != 1:
        raise SystemExit('docs/GLOSSARY.md: expected one %s and one %s' % (start, end))
    doc = re.sub(re.escape(start) + r'[\s\S]*?' + re.escape(end), lambda m: start + '\n' + '\n'.join(lines) + '\n' + end, doc)
with open(doc_path, 'w', encoding='utf-8') as f:
    f.write(doc)
print(len(data), 'entries')
