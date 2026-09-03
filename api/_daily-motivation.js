const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MESSAGE_STEP = 37
const MESSAGE_OFFSET = 17

export const DAILY_MOTIVATION_TITLE = 'Good Morning ☀️'

export const DAILY_MOTIVATION_MESSAGES = Object.freeze([
  'A clear next step can brighten the whole day.',
  'Your thoughtful effort makes a real difference.',
  'Today is a good day to move one idea forward.',
  'Care and consistency create work people can trust.',
  'Fresh thinking often begins with a simple question.',
  'Your perspective adds value to the conversation.',
  'A calm start can lead to a strong finish.',
  'Good work grows when people feel supported.',
  'One useful improvement is worth celebrating.',
  'Curiosity can turn a routine task into a discovery.',
  'You do not need every answer to begin.',
  'Progress feels better when we build it together.',
  'A thoughtful pause can improve the next decision.',
  'Your contribution helps the bigger picture take shape.',
  'Make room today for one promising possibility.',
  'Reliable work is built through careful choices.',
  'Sharing what you know helps everyone grow.',
  'A kind response can change the direction of a day.',
  'The next useful win may be closer than it seems.',
  'Every challenge contains information we can use.',
  'Your best pace is the one you can sustain.',
  'Focus on what can become clearer today.',
  'Strong teams make space for different voices.',
  'A well-timed question can unlock a better path.',
  'The care you bring is part of the result.',
  'Useful progress can begin with a two-minute action.',
  'Today’s effort can make tomorrow easier.',
  'Clear communication turns good intentions into momentum.',
  'There is value in improving something quietly.',
  'A flexible plan leaves room for better ideas.',
  'You can be both ambitious and patient.',
  'Thoughtful details help good work travel farther.',
  'Asking for help is a practical way forward.',
  'A steady rhythm can carry a meaningful goal.',
  'Your attention is a resource; place it with care.',
  'New ideas need room before they need polish.',
  'A respectful conversation can reveal a new direction.',
  'Celebrate the work that makes future work simpler.',
  'The useful lesson may outlast the perfect outcome.',
  'Give today’s most meaningful task your clearest hour.',
  'Good collaboration begins with genuine listening.',
  'A fresh approach can start with one changed assumption.',
  'Your experience can help someone else move forward.',
  'Keep what works, and improve what could work better.',
  'A clear boundary can protect your best work.',
  'There is strength in choosing a manageable pace.',
  'Today offers another chance to make something useful.',
  'A little preparation can create welcome ease.',
  'The right priority can make a busy day feel lighter.',
  'Constructive feedback creates shared clarity.',
  'Let steady effort do more than sudden pressure.',
  'Thoughtful work leaves people better supported.',
  'A simple solution can still be an excellent one.',
  'Notice what is working and build from there.',
  'Your ideas deserve a clear, confident voice.',
  'Progress can look like learning what to change.',
  'Make the next handoff easier for the person after you.',
  'A good question is often a form of leadership.',
  'Careful listening can reveal the real opportunity.',
  'Leave a little space for an unexpected insight.',
  'The work improves when the process includes everyone.',
  'Your calm can help a difficult moment become workable.',
  'A useful draft creates something real to improve.',
  'Aim for clarity that others can carry forward.',
  'Thoughtful refinements can make an experience feel effortless.',
  'Give your energy to what matters, not only what is loud.',
  'A sincere thank-you can strengthen an entire team.',
  'Your reliability gives others room to do their best.',
  'Better decisions often begin with better context.',
  'Let curiosity lead before assumptions settle in.',
  'A shared goal becomes stronger with shared ownership.',
  'Thoughtful simplicity is a valuable kind of progress.',
  'Your work can be precise without losing warmth.',
  'A brief reset can return focus to the right place.',
  'Each useful conversation adds strength to the work.',
  'Make today’s plan clear enough to stay flexible.',
  'Consistency gives good ideas time to become real.',
  'The next improvement may already be visible.',
  'Bring both confidence and openness to the next step.',
  'Good service begins with seeing the person behind the task.',
  'A measured response can create lasting trust.',
  'Your care can make a complex process feel simple.',
  'A better outcome may start with a better question.',
  'Take pride in work that helps others succeed.',
  'The strongest solution may come from an unexpected voice.',
  'Give useful ideas the follow-through they deserve.',
  'A little clarity can release a lot of energy.',
  'What you simplify today can help many people tomorrow.',
  'Sustainable progress respects both goals and people.',
  'End the day knowing you moved something worthwhile forward.',
])

export function getIstanbulCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  }
}

export function getDailyMotivation(date = new Date()) {
  const { year, month, day } = getIstanbulCalendarDate(date)
  const dayNumber = Math.floor(
    Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY,
  )
  const messageCount = DAILY_MOTIVATION_MESSAGES.length
  const messageIndex = (
    (dayNumber * MESSAGE_STEP + MESSAGE_OFFSET) % messageCount + messageCount
  ) % messageCount

  return {
    date: [year, month, day]
      .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0'))
      .join('-'),
    messageId: messageIndex + 1,
    title: DAILY_MOTIVATION_TITLE,
    body: DAILY_MOTIVATION_MESSAGES[messageIndex],
    url: '/',
  }
}
