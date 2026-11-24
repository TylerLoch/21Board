// 21Board Weather: the district's school year, as data. Next year's calendar replaces this file, and only this file.
// From CCSD21's Amended 2026–2027 Academic Calendar (Aug 20, 2026). Elementary and middle schools share every day off.
// Half days count as school days. Pre-K's own days off are left out. E-learning on Apr 6 counts as no school: students
// are home. Before the first day and after the last day, every weekday is a school day except those listed here.
self.B21WeatherCalendar = {
  year: '2026–27',
  firstDay: '2026-08-19',
  lastDay: '2027-05-28',
  noSchool: [
    '2026-08-17', '2026-08-18',                                           // Institute Days
    '2026-09-07',                                                         // Labor Day
    '2026-09-21',                                                         // Yom Kippur
    '2026-10-12',                                                         // Columbus/Indigenous Peoples’ Day
    '2026-10-28',                                                         // Institute Day
    '2026-11-03',                                                         // Election Day
    '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', // Conferences, Thanksgiving
    '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25', // Winter Break
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
    '2027-01-04',                                                         // Institute Day
    '2027-01-18',                                                         // Dr. Martin Luther King, Jr.’s Birthday
    '2027-02-15',                                                         // Presidents’ Day
    '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', // Spring Break
    '2027-04-06',                                                         // E-Learning Day (Election Day)
    '2027-05-07',                                                         // Non-Attendance Day
    '2027-05-31',                                                         // Memorial Day
    '2027-06-18'                                                          // Juneteenth (observed)
  ],
  // School ends at 11 AM for middle school, 12 PM for elementary.
  halfDays: ['2026-09-30', '2027-02-18', '2027-05-20']
};
