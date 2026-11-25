export type Skill = 'grammar' | 'reading' | 'writing';

export interface AdvancedQuestion {
  id: string;
  prompt: string;
  instruction: string;
  answers: string[];
  explanation: string;
  options?: string[];
  wordLimit?: number;
}

export interface AdvancedSet {
  id: string;
  skill: Skill;
  title: string;
  level: string;
  minutes: number;
  questions: AdvancedQuestion[];
  passage?: string[];
  checklist?: string[];
}

type Question = Omit<AdvancedQuestion, 'id'>;
const questions = (...items: Question[]): AdvancedQuestion[] => items.map((item, index) => ({ ...item, id: `q${index + 1}` }));
const truth = ['True', 'False', 'Not Given'];
const fact = (prompt: string, answer: string, explanation: string): Question => ({
  prompt, instruction: 'True / False / Not Given. Оцени утверждение только по тексту.', answers: [answer], options: truth, explanation,
});
const gap = (prompt: string, answer: string, explanation: string): Question => ({
  prompt, instruction: 'Заполни пропуск. Не более двух слов из текста.', answers: [answer], wordLimit: 2, explanation,
});
const heading = (part: string, options: string[], answer: string, explanation: string): Question => ({
  prompt: `Choose the best heading for paragraph ${part}.`, instruction: 'Подбери заголовок по главной мысли абзаца.', options, answers: [answer], explanation,
});
const rewrite = (prompt: string, answers: string[], explanation: string): Question => ({
  prompt, instruction: 'Перефразируй. Впиши только пропущенные слова, не меняя данное слово.', answers, explanation,
});
const edit = (prompt: string, answers: string[], explanation: string): Question => ({
  prompt, instruction: 'Исправь одну ошибку и введи всё предложение.', answers, explanation,
});

const libraryHeadings = ['A change in who could participate', 'Looking beyond the number of repairs', 'A shortage of spare parts', 'An unexpected use for the library'];
const heatHeadings = ['Why averages hide local conditions', 'How the route changed', 'Why the data needed a second look', 'A proposal to close streets'];

export const advancedSets: AdvancedSet[] = [
  {
    id: 'grammar-meaning-v1', skill: 'grammar', title: 'Один смысл, другая конструкция', level: 'B1+', minutes: 9,
    questions: questions(
      rewrite('Although the instructions were unclear, Maya finished the task. → In spite of ___ unclear, Maya finished the task. (BEING)', ['the instructions being'], 'После in spite of здесь нужна конструкция с -ing. Подлежащее внутри неё — the instructions.'),
      rewrite('I last spoke to Joel in April. → I ___ April. (SINCE)', ["haven’t spoken to Joel since", 'have not spoken to Joel since'], 'Отрицательный Present Perfect обозначает отсутствие события от точки отсчёта до настоящего.'),
      rewrite('They will announce the results on Friday. → The results ___ Friday. (BE)', ['will be announced on'], 'В будущем пассив строится как will be + past participle.'),
      rewrite('I cannot send the file because I do not have the password. → If I ___ the password, I could send the file. (HAD)', ['had'], 'Second Conditional описывает гипотетическую ситуацию сейчас. После if употребляется Past Simple.'),
      edit('Do you know where did she put the keys?', ['Do you know where she put the keys?'], 'В косвенном вопросе после where прямой порядок слов. Did не нужен.'),
      edit('We have been waiting since three hours.', ['We have been waiting for three hours.'], 'For вводит длительность. Since вводит точку начала.'),
      edit('He suggested to meet outside the station.', ['He suggested meeting outside the station.'], 'После suggest можно использовать герундий. Здесь нужна форма meeting.'),
      rewrite('The box was so heavy that Lena could not lift it. → The box was ___ to lift. (TOO)', ['too heavy for Lena'], 'Too + adjective + for someone + to do something. Повторять it после lift не нужно.'),
    ),
  },
  {
    id: 'grammar-precision-v1', skill: 'grammar', title: 'Грамматика в деталях', level: 'B2', minutes: 11,
    questions: questions(
      rewrite('The team missed the deadline because the estimate was wrong. → If the estimate had been right, the team ___ the deadline. (HAVE)', ['would not have missed', "wouldn’t have missed"], 'Third Conditional: would have + past participle в результате. Отрицание сохраняет исходный смысл.'),
      rewrite('I only understood the problem after reading the report. → Only after reading the report ___ the problem. (DID)', ['did I understand'], 'После вынесенного в начало only after требуется инверсия: did + подлежащее + начальная форма.'),
      rewrite('We bought extra tickets, but they turned out to be unnecessary. → We ___ extra tickets. (NEED)', ['need not have bought', 'needn’t have bought'], 'Need not have done означает, что действие произошло, хотя необходимости не было.'),
      edit('The equipment, that arrived yesterday, is ready to use.', ['The equipment, which arrived yesterday, is ready to use.'], 'Уточнение между запятыми — non-defining relative clause. Для предмета подходит which.'),
      edit('The proposal is expected to approved tomorrow.', ['The proposal is expected to be approved tomorrow.'], 'Пассивный инфинитив после expected: to be approved.'),
      rewrite('I am sure she is still working. → She ___ working. (MUST)', ['must still be'], 'Must be working выражает уверенный вывод о действии, которое идёт сейчас.'),
      edit('I wish I would have more time this week.', ['I wish I had more time this week.'], 'Wish + Past Simple описывает желаемое, но нереальное положение сейчас.'),
      rewrite('The manager said the delay was not caused by the supplier. → The manager denied that the supplier ___ the delay. (CAUSED)', ['had caused', 'caused'], 'Denied that уже передаёт отрицание. Past Perfect подчёркивает, что возможная причина предшествовала словам менеджера.'),
    ),
  },
  {
    id: 'reading-repair-v1', skill: 'reading', title: 'The library that lends tools', level: 'B1+', minutes: 9,
    passage: [
      'The Northfield Library began lending tools when its meeting room was no longer needed for evening classes. A group of residents suggested using the space for equipment that people seldom need to own, such as drills and carpet cleaners. The library did not buy the first collection: every item was donated and checked by a volunteer before it went onto a shelf.',
      'The first workshops were held on Thursday evenings and attracted mainly people who already knew how to make basic repairs. In response, the organisers introduced a Saturday session for beginners. They also began providing written instructions in several languages. This made it easier for residents to join even when they were not comfortable asking questions in English.',
      'The council originally judged the scheme by counting repaired objects. That number was useful, but it did not show whether residents learned to fix things on their own. The organisers therefore added a short follow-up survey. It asked borrowers whether they had completed the repair, needed further advice or decided to replace the item. Responses were voluntary and were collected three weeks after a loan ended.',
      'Some tools are now reserved several days in advance, while others are rarely borrowed. The library has resisted buying more of every popular item. It checks whether the demand continues through several months first, because a short-lived increase can be caused by seasonal work. Borrowers can suggest new tools, although there is no guarantee that the library will add them.',
    ],
    questions: questions(
      heading('A', libraryHeadings, libraryHeadings[3], 'Абзац A объясняет, как свободное помещение библиотеки получило новое назначение.'),
      heading('B', libraryHeadings, libraryHeadings[0], 'Абзац B о том, как занятия для новичков и переводы расширили круг участников.'),
      heading('C', libraryHeadings, libraryHeadings[1], 'Абзац C объясняет, какие результаты не отражал простой подсчёт ремонтов.'),
      fact('The library purchased its original collection of tools.', 'False', 'В A прямо сказано, что все первые инструменты пожертвовали.'),
      fact('The Saturday sessions cost less than the Thursday workshops.', 'Not Given', 'В B сравниваются участники и расписание. Цены не указаны.'),
      fact('The library looks for lasting demand before increasing its stock.', 'True', 'В D говорится, что библиотека ждёт подтверждения спроса несколько месяцев.'),
      gap('Borrowers were asked to complete a short ___ after the loan.', 'follow-up survey', 'В C это название анкеты о результате ремонта.'),
      gap('A temporary rise in borrowing may be explained by ___.', 'seasonal work', 'В D сезонные работы приведены как причина кратковременного скачка спроса.'),
    ),
  },
  {
    id: 'reading-heat-v1', skill: 'reading', title: 'Mapping heat at street level', level: 'B2', minutes: 11,
    passage: [
      'A weather station can describe conditions for a whole district, yet its readings reveal little about the temperature on a particular pavement. Two streets with the same air temperature can feel quite different if one has shade and the other is bordered by walls that release stored heat. The Bellwick project therefore examined short journeys rather than comparing broad districts.',
      'Volunteers carried sensors along the same route in the morning and late afternoon. The researchers noticed that readings taken beside bus stops were often unusually high. Rather than removing those results immediately, they compared the time stamps with the volunteers’ notes. The hottest readings followed long waits in direct sunlight, so the team reported the values separately as measurements of waiting conditions.',
      'One of the proposed routes to a health centre was only slightly cooler than the shortest route. It did, however, include shaded benches and crossings with shorter waiting times. When a small group tried both routes, most preferred the longer one. The report cautioned that these preferences did not prove the route would suit all residents, particularly those whose journeys began in other parts of the district.',
      'The council used the map to plan where to place temporary shade structures. It avoided making permanent changes until the sensors had been used again in a different season. The method was inexpensive to repeat, which allowed the council to treat the map as a record that could be revised, rather than as a final statement about which streets were safest.',
    ],
    questions: questions(
      heading('A', heatHeadings, heatHeadings[0], 'Абзац показывает, почему районные показатели не описывают конкретные улицы.'),
      heading('B', heatHeadings, heatHeadings[2], 'Команда выяснила причину высоких показаний и представила их отдельно.'),
      fact('The project compared entire districts rather than short journeys.', 'False', 'В последнем предложении A указано обратное.'),
      fact('The volunteers received payment for carrying the sensors.', 'Not Given', 'Оплата или её отсутствие не обсуждаются.'),
      fact('Most people in the small trial preferred the longer route.', 'True', 'В C прямо говорится, что большинство выбрало более длинный маршрут.'),
      gap('The researchers compared the volunteers’ notes with the ___.', 'time stamps', 'В B команда сопоставила отметки времени с заметками волонтёров.'),
      gap('The longer route offered places to rest on ___.', 'shaded benches', 'Абзац C упоминает скамейки в тени.'),
      gap('The first council plans involved installing temporary ___ structures.', 'shade', 'В D используется точное сочетание temporary shade structures.'),
    ),
  },
  {
    id: 'writing-opinion-v1', skill: 'writing', title: 'Эссе: навыки в школе', level: 'B1–B2', minutes: 20,
    checklist: ['Позиция понятна уже во вступлении.', 'Каждый основной абзац развивает одну мысль и подкрепляет её примером.', 'Рассмотрен контраргумент и объяснено, почему твоя позиция всё равно убедительна.', 'Связки естественны, а времена, артикли и согласование проверены.'],
    questions: questions({
      prompt: 'Some people think that schools should spend more time on practical skills such as budgeting and basic repairs. Others believe traditional academic subjects should remain the priority. Discuss both views and give your own opinion.',
      instruction: 'Напиши 180–230 слов. Обсуди обе позиции и объясни свою.', answers: [],
      explanation: 'Schools prepare young people for more than examinations, so it is reasonable to ask whether practical skills should have a larger place in the timetable. In my view, schools should teach such skills regularly while keeping academic subjects at the centre of their programmes.\n\nOne reason to include practical lessons is that not every student learns these skills at home. For instance, a class could compare mobile phone contracts and work out how much each one costs over a year. Such a task would help students make decisions on their own and show them how mathematics applies outside the classroom.\n\nOn the other hand, reducing time for subjects such as science and history could limit students’ future choices. These subjects provide knowledge that is difficult to acquire through short practical courses. A student who later wants to study engineering, for example, will need a strong understanding of mathematics and physics, even if they are already good at fixing things.\n\nA sensible compromise is to include practical projects within existing subjects. A budgeting project can reinforce mathematical skills, while a repair project can demonstrate ideas from physics. This approach would give students useful experience without making practical and academic learning compete for the same time.',
    }),
  },
  {
    id: 'writing-data-v1', skill: 'writing', title: 'Отчёт: сравнение данных', level: 'B2', minutes: 16,
    passage: ['Weekly trips to the city centre (thousands)', 'Bus: 2019 — 42 · 2024 — 55', 'Bicycle: 2019 — 11 · 2024 — 28', 'Car: 2019 — 63 · 2024 — 49', 'Train: 2019 — 34 · 2024 — 37'],
    checklist: ['Есть обзор двух главных тенденций.', 'Сравнения подкреплены цифрами и единицами измерения.', 'Цифры и направления изменений переданы верно.', 'В отчёте нет причин или прогнозов, которых нет в данных.'],
    questions: questions({
      prompt: 'Summarise the changes in weekly trips to the city centre. Select the main features and make comparisons where relevant.',
      instruction: 'Напиши около 150 слов по данным слева. Сначала дай обзор, затем сравни цифры.', answers: [],
      explanation: 'The figures show the number of weekly journeys to the city centre by four forms of transport in 2019 and 2024. The numbers are measured in thousands of trips.\n\nOverall, travel by bus, bicycle and train increased, while car travel declined. Cars were the most popular option in 2019, but buses took the lead by 2024. Bicycle use more than doubled, although it remained the least common of the four modes.\n\nWeekly bus journeys rose from 42,000 to 55,000, a gain of 13,000. Over the same period, trips by car fell by 14,000, from 63,000 to 49,000. This meant that buses went from being 21,000 trips behind cars to being 6,000 ahead.\n\nThe number of bicycle journeys increased from 11,000 to 28,000, the largest increase in absolute terms. By comparison, train travel changed relatively little, rising from 34,000 to 37,000 trips per week. Train journeys still outnumbered bicycle journeys in 2024, but the gap narrowed considerably.',
    }),
  },
];
