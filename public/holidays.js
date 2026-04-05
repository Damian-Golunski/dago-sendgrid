// Public holidays 2026 for DAGO Express main markets.
// Source: zendesk-dispo-assistant/holidays.py (Dispo Transportanfragen agent, 2026-04-04).
// Countries: NL, DE, PL, ES, FR, IT, GB (EN)
// TODO: Update before 2027.

const HOLIDAYS_2026 = {
  DE: [
    ['2026-01-01', 'Neujahr'],
    ['2026-04-03', 'Karfreitag'],
    ['2026-04-05', 'Ostersonntag'],
    ['2026-04-06', 'Ostermontag'],
    ['2026-05-01', 'Tag der Arbeit'],
    ['2026-05-14', 'Christi Himmelfahrt'],
    ['2026-05-24', 'Pfingstsonntag'],
    ['2026-05-25', 'Pfingstmontag'],
    ['2026-10-03', 'Tag der Deutschen Einheit'],
    ['2026-12-25', '1. Weihnachtsfeiertag'],
    ['2026-12-26', '2. Weihnachtsfeiertag'],
  ],
  NL: [
    ['2026-01-01', 'Nieuwjaarsdag'],
    ['2026-04-05', 'Eerste Paasdag'],
    ['2026-04-06', 'Tweede Paasdag'],
    ['2026-04-27', 'Koningsdag'],
    ['2026-05-05', 'Bevrijdingsdag'],
    ['2026-05-14', 'Hemelvaartsdag'],
    ['2026-05-24', 'Eerste Pinksterdag'],
    ['2026-05-25', 'Tweede Pinksterdag'],
    ['2026-12-25', 'Eerste Kerstdag'],
    ['2026-12-26', 'Tweede Kerstdag'],
  ],
  PL: [
    ['2026-01-01', 'Nowy Rok'],
    ['2026-01-06', 'Trzech Króli'],
    ['2026-04-05', 'Wielkanoc'],
    ['2026-04-06', 'Poniedziałek Wielkanocny'],
    ['2026-05-01', 'Święto Pracy'],
    ['2026-05-03', 'Święto Konstytucji'],
    ['2026-06-04', 'Boże Ciało'],
    ['2026-08-15', 'Wniebowzięcie NMP'],
    ['2026-11-01', 'Wszystkich Świętych'],
    ['2026-11-11', 'Święto Niepodległości'],
    ['2026-12-25', 'Boże Narodzenie'],
    ['2026-12-26', 'Drugi dzień BN'],
  ],
  ES: [
    ['2026-01-01', 'Año Nuevo'],
    ['2026-01-06', 'Epifanía'],
    ['2026-04-03', 'Viernes Santo'],
    ['2026-05-01', 'Día del Trabajador'],
    ['2026-08-15', 'Asunción'],
    ['2026-10-12', 'Fiesta Nacional'],
    ['2026-11-01', 'Todos los Santos'],
    ['2026-12-06', 'Día de la Constitución'],
    ['2026-12-08', 'Inmaculada Concepción'],
    ['2026-12-25', 'Navidad'],
  ],
  FR: [
    ['2026-01-01', "Jour de l'an"],
    ['2026-04-06', 'Lundi de Pâques'],
    ['2026-05-01', 'Fête du Travail'],
    ['2026-05-08', 'Victoire 1945'],
    ['2026-05-14', 'Ascension'],
    ['2026-05-25', 'Lundi de Pentecôte'],
    ['2026-07-14', 'Fête nationale'],
    ['2026-08-15', 'Assomption'],
    ['2026-11-01', 'Toussaint'],
    ['2026-11-11', 'Armistice'],
    ['2026-12-25', 'Noël'],
  ],
  IT: [
    ['2026-01-01', 'Capodanno'],
    ['2026-01-06', 'Epifania'],
    ['2026-04-05', 'Pasqua'],
    ['2026-04-06', "Lunedì dell'Angelo"],
    ['2026-04-25', 'Festa della Liberazione'],
    ['2026-05-01', 'Festa del Lavoro'],
    ['2026-06-02', 'Festa della Repubblica'],
    ['2026-08-15', 'Ferragosto'],
    ['2026-11-01', 'Ognissanti'],
    ['2026-12-08', 'Immacolata Concezione'],
    ['2026-12-25', 'Natale'],
    ['2026-12-26', 'Santo Stefano'],
  ],
  GB: [
    ['2026-01-01', "New Year's Day"],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-05-04', 'Early May Bank Holiday'],
    ['2026-05-25', 'Spring Bank Holiday'],
    ['2026-08-31', 'Summer Bank Holiday'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-26', 'Boxing Day'],
  ],
};

const COUNTRY_FLAGS = {
  DE: '🇩🇪', NL: '🇳🇱', PL: '🇵🇱', ES: '🇪🇸', FR: '🇫🇷', IT: '🇮🇹', GB: '🇬🇧',
};

// Build a day -> [{cc, name}] index
const HOLIDAYS_BY_DAY = (() => {
  const idx = {};
  for (const [cc, list] of Object.entries(HOLIDAYS_2026)) {
    for (const [day, name] of list) {
      (idx[day] = idx[day] || []).push({ cc, name });
    }
  }
  return idx;
})();

function holidaysOn(day) { return HOLIDAYS_BY_DAY[day] || []; }
