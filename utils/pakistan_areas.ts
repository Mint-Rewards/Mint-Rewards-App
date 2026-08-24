/**
 * Canonical Pakistan location data for Mint Rewards.
 *
 * SINGLE SOURCE OF TRUTH. Every province, city, town and sub-area option shown
 * anywhere in the app must come from this file via the helpers below. Do not
 * hardcode, infer or duplicate any of these names elsewhere.
 *
 * Hierarchy: province -> city -> town -> subArea.
 *
 * `subAreas` is keyed by a composite "City::Town" string rather than by town
 * name alone: town names such as "Cantt", "Satellite Town" and "Model Town"
 * repeat across cities, so a town-only key would collide. Always go through
 * `getSubAreasForTown(city, town)`.
 *
 * Originally generated 2026-08-05 from the since-removed pakistan_areas.json
 * (City -> Area -> Sub-areas, version 1.0, 2026-07-24), whose area names the
 * town lists were aligned to. That JSON is gone; this file is now hand-owned
 * and is the only copy. Edit it directly.
 */

export interface LocationData {
  provinces: string[];
  cities: Record<string, string[]>;
  towns: Record<string, string[]>;
  /** Keyed by `${city}::${town}` — see note above. */
  subAreas: Record<string, string[]>;
}

export const PAKISTAN_LOCATIONS: LocationData = {
  provinces: [
    "Punjab",
    "Sindh",
    "Khyber Pakhtunkhwa",
    "Balochistan",
    "Islamabad Capital Territory",
    "Azad Jammu & Kashmir",
    "Gilgit-Baltistan",
  ],

  cities: {
    Punjab: [
      "Lahore",
      "Faisalabad",
      "Rawalpindi",
      "Gujranwala",
      "Multan",
      "Sialkot",
      "Bahawalpur",
      "Sargodha",
      "Sheikhupura",
      "Jhang",
      "Gujrat",
      "Rahim Yar Khan",
      "Kasur",
      "Dera Ghazi Khan",
      "Sahiwal",
    ],
    Sindh: [
      "Karachi",
      "Hyderabad",
      "Sukkur",
      "Larkana",
      "Nawabshah",
      "Mirpur Khas",
      "Jacobabad",
      "Shikarpur",
      "Khairpur",
      "Thatta",
    ],
    "Khyber Pakhtunkhwa": [
      "Peshawar",
      "Mardan",
      "Mingora",
      "Kohat",
      "Abbottabad",
      "Mansehra",
      "Dera Ismail Khan",
      "Swabi",
      "Nowshera",
      "Charsadda",
    ],
    Balochistan: [
      "Quetta",
      "Turbat",
      "Khuzdar",
      "Hub",
      "Chaman",
      "Gwadar",
      "Dera Murad Jamali",
      "Sibi",
      "Zhob",
      "Loralai",
    ],
    "Islamabad Capital Territory": [
      "Islamabad",
    ],
    "Azad Jammu & Kashmir": [
      "Muzaffarabad",
      "Mirpur",
      "Rawalakot",
      "Kotli",
      "Bhimber",
      "Bagh",
    ],
    "Gilgit-Baltistan": [
      "Gilgit",
      "Skardu",
      "Chilas",
      "Hunza",
      "Ghanche",
      "Ghizer",
    ],
  },

  towns: {
    Lahore: [
      "DHA Lahore",
      "Bahria Town Lahore",
      "Gulberg",
      "Model Town",
      "Johar Town",
      "Wapda Town",
      "Garden Town",
      "Township",
      "Cantt",
      "Iqbal Town",
      "Faisal Town",
      "EME Society",
      "Valencia Town",
      "PCSIR Housing Scheme",
      "Punjab Cooperative Housing Society (PCHS)",
      "Cavalry Ground",
      "Sui Gas Society",
      "Lake City",
      "State Life Housing Society",
      "PGEHS (Punjab Govt Employees Housing Scheme)",
      "LDA Avenue",
      "Jubilee Town",
      "Sabzazar",
      "Shahdara",
      "Shadman",
      "Samanabad",
      "Raiwind",
    ],
    Karachi: [
      "DHA",
      "Clifton",
      "PECHS",
      "Gulshan-e-Iqbal",
      "Gulistan-e-Jauhar",
      "North Karachi",
      "North Nazimabad",
      "Nazimabad",
      "Federal B. Area",
      "Liaquatabad",
      "Korangi",
      "Landhi",
      "Malir",
      "Shah Faisal Colony",
      "Bahria Town Karachi",
      "Askari",
      "Buffer Zone",
      "Gulshan-e-Hadeed",
      "Garden",
      "Orangi Town",
      "Saddar",
      "KAECHS",
      "Gulshan-e-Maymar",
      "Scheme 33",
      "New Karachi",
      "Defence View",
      "Gulzar-e-Hijri",
      "Surjani Town",
      "Naya Nazimabad",
    ],
    Islamabad: [
      "Sector E-7",
      "Sector E-8",
      "Sector E-9",
      "Sector E-10",
      "Sector E-11",
      "Sector E-12",
      "Sector E-16",
      "Sector E-17",
      "Sector F-5",
      "Sector F-6",
      "Sector F-7",
      "Sector F-8",
      "Sector F-9 (Fatima Jinnah Park)",
      "Sector F-10",
      "Sector F-11",
      "Sector F-17",
      "Sector G-5",
      "Sector G-6",
      "Sector G-7",
      "Sector G-8",
      "Sector G-9",
      "Sector G-10",
      "Sector G-11",
      "Sector G-12",
      "Sector G-13",
      "Sector G-14",
      "Sector G-15",
      "Sector G-16",
      "Sector H-8",
      "Sector H-9",
      "Sector H-10",
      "Sector H-11",
      "Sector H-12",
      "Sector H-13",
      "Sector I-8",
      "Sector I-9",
      "Sector I-10",
      "Sector I-11",
      "Sector I-12",
      "Sector I-14",
      "Sector I-15",
      "Sector I-16",
      "Blue Area",
      "Sector D-12",
      "Sector D-17",
      "Sector C-14",
      "Sector C-15",
      "Sector B-17",
      "DHA Islamabad",
      "Bahria Town Islamabad",
      "PWD Housing Scheme",
      "Pakistan Town",
      "CBR Town",
      "Gulberg Greens",
      "Gulberg Residencia",
      "Top City",
      "Capital Smart City",
      "Bani Gala",
      "Margalla Town",
    ],
    Rawalpindi: [
      "Satellite Town",
      "Bahria Town Phase 8",
      "Chaklala Scheme 3",
      "Askari",
      "Westridge",
      "Adiala Road",
      "Saddar",
      "Rawalpindi Cantt",
      "Bahria Town",
      "DHA",
      "Chaklala",
      "Gulzar-e-Quaid",
      "Gulshan Abad",
      "Raja Bazaar",
      "Pirwadhai",
    ],
    Faisalabad: [
      "Peoples Colony",
      "Madina Town",
      "Gulberg",
      "Samanabad",
      "Ghulam Muhammad Abad",
      "Batala Colony",
      "Jinnah Colony",
      "Eden Valley",
      "Citi Housing",
      "Wapda City",
      "Susan Road",
      "Millat Town",
      "Canal Road",
      "Tariq Abad",
      "Civil Lines",
    ],
    Peshawar: [
      "Hayatabad",
      "University Town",
      "Peshawar Cantt",
      "DHA Peshawar",
      "Regi Model Town",
      "Warsak Road",
      "Saddar",
      "Gulbahar",
      "Khyber Bazaar",
      "Chamkani",
      "Pabbi",
      "Ring Road",
    ],
    Quetta: [
      "Satellite Town",
      "Cantonment",
      "Samungli",
      "Jinnah Town",
      "Zarghoon Road",
      "Sariab Road",
      "Brewery Road",
      "Airport Road",
      "Spinny Road",
      "Adalat Road",
    ],
    Multan: [
      "DHA Multan",
      "Bosan Road",
      "Shah Rukn-e-Alam Colony",
      "Gulgasht Colony",
      "Wapda Town",
      "Officers Colony",
      "Model Town",
      "Citi Housing Multan",
      "Cantt",
      "Nawan Shehr",
      "Qasim Bela",
      "Old Multan",
      "Shujabad Road",
    ],
    Hyderabad: [
      "Latifabad",
      "Qasimabad",
      "Cantonment",
      "Gulshan-e-Shahbaz",
      "Saddar",
      "Hirabad",
      "Kotri",
      "Hussainabad",
      "New Hyderabad",
    ],
    Gujranwala: [
      "Cantt",
      "Satellite Town",
      "Model Town",
      "Peoples Colony",
      "Trust Colony",
      "Shabbir Colony",
      "Civil Lines",
    ],
  },

  subAreas: {
    "Lahore::DHA Lahore": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
      "Phase 4",
      "Phase 5",
      "Phase 5 - Block A",
      "Phase 5 - Block B",
      "Phase 5 - Block C",
      "Phase 5 - Block D",
      "Phase 5 - Block E",
      "Phase 5 - Block F",
      "Phase 5 - Block G",
      "Phase 5 - Block H",
      "Phase 5 - Block J",
      "Phase 5 - Block K",
      "Phase 5 - Block L",
      "Phase 6",
      "Phase 6 - Block A",
      "Phase 6 - Block B",
      "Phase 6 - Block C",
      "Phase 6 - Block D",
      "Phase 6 - Block E",
      "Phase 6 - Block F",
      "Phase 6 - Block G",
      "Phase 6 - Block H",
      "Phase 6 - Block J",
      "Phase 6 - Block K",
      "Phase 7",
      "Phase 8",
      "Phase 8 - Block A",
      "Phase 8 - Block B",
      "Phase 8 - Block C",
      "Phase 8 - Block D",
      "Phase 8 - Block S",
      "Phase 8 - Block T",
      "Phase 8 - Block U",
      "Phase 8 - Block V",
      "Phase 8 - Block W",
      "Phase 9 Town",
      "Phase 9 Prism",
      "Phase 10",
      "Phase 11 (Rahbar)",
    ],
    "Lahore::Bahria Town Lahore": [
      "Sector A",
      "Sector B",
      "Sector C",
      "Sector D",
      "Sector E",
      "Sector F",
      "Janiper Block",
      "Jasmine Block",
      "Tulip Block",
      "Tauheed Block",
      "Tipu Sultan Block",
      "Iqbal Block",
      "Usman Block",
      "Umar Block",
      "Ali Block",
      "Nargis Block",
      "Chambelli Block",
      "Gulbahar Block",
      "Overseas Block",
      "Safari Villas",
      "Bahria Orchard",
      "Bahria Education & Medical City",
    ],
    "Lahore::Gulberg": [
      "Block A (Gulberg I)",
      "Block B (Gulberg I)",
      "Block C (Gulberg I)",
      "Block D (Gulberg I)",
      "Block E (Gulberg I)",
      "Gulberg II",
      "Gulberg III",
      "Gulberg IV (Garden Town)",
      "Hussain Chowk",
      "Liberty Market",
      "Main Boulevard Gulberg",
      "MM Alam Road",
    ],
    "Lahore::Model Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block J",
      "Block K",
      "Block L",
      "Block M",
      "Block N",
      "Block P",
      "Block Q",
      "Block R",
      "Model Town Extension",
      "Model Town Link Road",
    ],
    "Lahore::Johar Town": [
      "Block A",
      "Block A-1",
      "Block A-2",
      "Block A-3",
      "Block B",
      "Block B-1",
      "Block B-2",
      "Block B-3",
      "Block C",
      "Block C-1",
      "Block C-2",
      "Block D",
      "Block D-1",
      "Block D-2",
      "Block E",
      "Block E-1",
      "Block E-2",
      "Block F",
      "Block F-1",
      "Block F-2",
      "Block G",
      "Block G-1",
      "Block G-2",
      "Block G-3",
      "Block H",
      "Block H-1",
      "Block H-2",
      "Block H-3",
      "Block J",
      "Block J-1",
      "Block J-2",
      "Block J-3",
      "Block K",
      "Block L",
      "Block M",
      "Block N",
      "Block P",
      "Block R",
      "Fazaia Housing Scheme",
    ],
    "Lahore::Wapda Town": [
      "Phase 1 - Block A",
      "Phase 1 - Block B",
      "Phase 1 - Block C",
      "Phase 1 - Block D",
      "Phase 1 - Block E",
      "Phase 1 - Block F",
      "Phase 1 - Block G",
      "Phase 1 - Block H",
      "Phase 1 - Block J",
      "Phase 1 - Block K",
      "Phase 2 - Block L",
      "Phase 2 - Block M",
      "Phase 2 - Block N",
      "Phase 2 - Block P",
      "Phase 2 - Block Q",
      "Phase 2 - Block R",
    ],
    "Lahore::Garden Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
    ],
    "Lahore::Township": [
      "Sector A-1",
      "Sector A-2",
      "Sector B-1",
      "Sector B-2",
      "Sector C-1",
      "Sector C-2",
      "Sector D-1",
      "Sector D-2",
    ],
    "Lahore::Cantt": [
      "Cantt Main",
      "Sarwar Road",
      "Mall Road Cantt",
      "Saddar Cantt",
      "Askari 9",
      "Askari 10",
      "Askari 11",
    ],
    "Lahore::Iqbal Town": [
      "Karim Block",
      "Nizam Block",
      "Hunza Block",
      "Ravi Block",
      "Mehran Block",
      "Neelam Block",
      "Kamran Block",
      "Khyber Block",
      "Rachna Block",
      "Satluj Block",
      "Chenab Block",
      "Jhelum Block",
      "Indus Block",
      "Kabir Town",
    ],
    "Lahore::Faisal Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Lahore::EME Society": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
    ],
    "Lahore::Valencia Town": [
      "Block A",
      "Block A-1",
      "Block B",
      "Block B-1",
      "Block C",
      "Block C-1",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block J",
    ],
    "Lahore::PCSIR Housing Scheme": [
      "Phase 1",
      "Phase 2",
    ],
    "Lahore::Punjab Cooperative Housing Society (PCHS)": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
    ],
    "Lahore::Cavalry Ground": [
      "Cavalry Ground Extension",
      "Main Cavalry Ground",
    ],
    "Lahore::Sui Gas Society": [
      "Phase 1",
      "Phase 2",
    ],
    "Lahore::Lake City": [
      "Sector M-1",
      "Sector M-2",
      "Sector M-2A",
      "Sector M-3",
      "Sector M-3 Extension",
      "Sector M-5",
      "Sector M-7",
      "Sector M-8",
      "Raiwind Road",
    ],
    "Lahore::State Life Housing Society": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
    ],
    "Lahore::PGEHS (Punjab Govt Employees Housing Scheme)": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
    ],
    "Lahore::LDA Avenue": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block J",
      "Block K",
    ],
    "Lahore::Jubilee Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
    ],
    "Lahore::Sabzazar": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block J",
      "Block K",
      "Block L",
      "Block M",
      "Block N",
      "Block P",
    ],
    "Lahore::Shahdara": [
      "Shahdara Main",
      "Shahdara Town",
    ],
    "Lahore::Shadman": [
      "Shadman 1",
      "Shadman 2",
    ],
    "Karachi::DHA": [
      "Phase 1",
      "Phase 2",
      "Phase 2 Extension",
      "Phase 3",
      "Phase 4",
      "Phase 5",
      "Phase 6",
      "Phase 7",
      "Phase 7 Extension",
      "Phase 8",
      "Phase 8 Extension",
      "Phase 9 (Creek Vista)",
    ],
    "Karachi::Clifton": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 5",
      "Block 6",
      "Block 7",
      "Block 8",
      "Block 9",
      "Kehkashan",
      "Zamzama",
      "Sea View",
      "Delhi Colony",
      "Punjab Colony",
      "Shah Rasool Colony",
    ],
    "Karachi::PECHS": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 5",
      "Block 6",
      "Block 7",
      "Khalid Bin Walid Road",
      "Tariq Road",
    ],
    "Karachi::Gulshan-e-Iqbal": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 4-A",
      "Block 5",
      "Block 6",
      "Block 7",
      "Block 8",
      "Block 9",
      "Block 10",
      "Block 10-A",
      "Block 11",
      "Block 12",
      "Block 13",
      "Block 13-A",
      "Block 13-B",
      "Block 13-C",
      "Block 13-D",
      "Block 14",
      "Block 15",
      "Block 16",
      "Block 17",
      "Block 18",
      "Block 19",
      "Adamjee Nagar",
      "Civic Center",
      "Dhoraji",
      "University Road",
    ],
    "Karachi::Gulistan-e-Jauhar": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 3-A",
      "Block 4",
      "Block 5",
      "Block 6",
      "Block 7",
      "Block 8",
      "Block 9",
      "Block 10",
      "Block 11",
      "Block 12",
      "Block 13",
      "Block 14",
      "Block 15",
      "Block 16",
      "Block 17",
      "Block 18",
      "Block 19",
      "Block 20",
    ],
    "Karachi::North Karachi": [
      "Sector 2",
      "Sector 3",
      "Sector 4",
      "Sector 5-A/1",
      "Sector 5-A/2",
      "Sector 5-A/3",
      "Sector 5-A/4",
      "Sector 5-B/1",
      "Sector 5-B/2",
      "Sector 5-B/3",
      "Sector 5-B/4",
      "Sector 5-C/1",
      "Sector 5-C/2",
      "Sector 5-C/3",
      "Sector 5-C/4",
      "Sector 5-I",
      "Sector 5-J",
      "Sector 5-K",
      "Sector 5-L",
      "Sector 5-M",
      "Sector 6",
      "Sector 7-D/1",
      "Sector 7-D/2",
      "Sector 7-D/3",
      "Sector 7-D/4",
      "Sector 8",
      "Sector 9",
      "Sector 10",
      "Sector 11-A",
      "Sector 11-B",
      "Sector 11-C/1",
      "Sector 11-C/2",
      "Sector 11-C/3",
      "Sector 11-E",
      "Sector 11-H",
      "Sector 11-I",
      "Sector 11-K",
      "Sector 11-L",
      "Sector 12-A",
      "Sector 12-C",
    ],
    "Karachi::North Nazimabad": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block I",
      "Block J",
      "Block K",
      "Block L",
      "Block M",
      "Block N",
      "Block O",
      "Block P",
      "Block Q",
      "Block R",
      "Block S",
      "Block T",
      "Block W",
    ],
    "Karachi::Nazimabad": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 5",
    ],
    "Karachi::Federal B. Area": [
      "Block 1 (Sharifabad)",
      "Block 2 (Sharifabad)",
      "Block 3 (Hussainabad)",
      "Block 4 (Tayyababad)",
      "Block 5 (Tayyababad)",
      "Block 6 (Tayyababad)",
      "Block 7 (Azizabad)",
      "Block 8 (Azizabad)",
      "Block 9",
      "Block 10 (Dastagir)",
      "Block 11",
      "Block 12",
      "Block 13",
      "Block 14 (Naseerabad)",
      "Block 15 (Naseerabad)",
      "Block 16 (Water Pump)",
      "Block 17 (Samanabad)",
      "Block 18 (Samanabad)",
      "Block 19 (Al-Noor Society)",
      "Block 20 (Ancholi)",
      "Block 21 (Industrial Area)",
      "Block 22 (Industrial Area)",
      "B Area",
      "B1 Area",
      "Azizabad",
    ],
    "Karachi::Liaquatabad": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 5",
      "Block 6",
      "Block 7",
      "Block 8",
      "Block 9",
      "Block 10",
    ],
    "Karachi::Korangi": [
      "Sector 31-B",
      "Sector 31-D",
      "Sector 32-B",
      "Sector 33-A",
      "Sector 33-B",
      "Sector 33-C",
      "Sector 33-D",
      "Sector 33-E",
      "Sector 33-F",
      "Sector 41-B",
      "Korangi Industrial Area",
      "Nasir Colony",
      "Zaman Town",
      "Zia Colony",
      "Mehran Town",
      "PAF Base Korangi Creek",
      "Abdullah Shah Noorani Pahari Colony",
    ],
    "Karachi::Landhi": [
      "36-B",
      "Awami Colony",
      "Labour Colony",
      "Landhi Industrial Area",
      "Bagh-e-Korangi",
      "Bakhtawar Goth",
      "Bhutto Nagar",
      "Future Colony",
      "Gulshan-e-Rafi",
      "Ilyas Goth",
      "Muslimabad Colony",
      "Muzaffarabad Colony",
      "Punjab Town",
      "Qasim Town",
      "Sadat Colony",
      "Shah Khalid Colony",
      "Sharafi Goth",
      "Zamanabad",
      "Barmi Colony",
      "Alflah Housing Society",
    ],
    "Karachi::Malir": [
      "Malir Town",
      "Malir Cantt",
      "Malir City",
      "Malir Halt",
      "Malir Extension",
      "Model Colony",
    ],
    "Karachi::Shah Faisal Colony": [
      "Shah Faisal Colony 1",
      "Shah Faisal Colony 2",
      "Shah Faisal Colony 3",
      "Shah Faisal Colony 4",
      "Shah Faisal Colony 5",
      "Aswan Town",
      "Gulshan-e-Asghar",
      "Green Town",
      "Shamsi Society",
      "Muslimabad Malir City",
    ],
    "Karachi::Bahria Town Karachi": [
      "Precinct 1",
      "Precinct 2",
      "Precinct 3",
      "Precinct 4",
      "Precinct 5",
      "Precinct 6",
      "Precinct 7",
      "Precinct 8",
      "Precinct 9",
      "Precinct 10",
      "Precinct 11",
      "Precinct 12",
      "Precinct 13",
      "Precinct 14",
      "Precinct 15",
      "Precinct 16",
      "Precinct 17",
      "Precinct 18",
      "Precinct 19",
      "Precinct 20",
      "Precinct 21",
      "Precinct 22",
      "Precinct 23",
      "Precinct 24",
      "Precinct 25",
      "Precinct 26",
      "Precinct 27",
      "Precinct 28",
      "Precinct 29",
      "Precinct 30",
      "Precinct 31",
      "Precinct 32",
      "Precinct 33",
    ],
    "Karachi::Askari": [
      "Askari 1",
      "Askari 2",
      "Askari 3",
      "Askari 4",
      "Askari 5",
    ],
    "Karachi::Buffer Zone": [
      "Sector 15-A/1",
      "Sector 15-A/2",
      "Sector 15-A/3",
      "Sector 15-A/4",
      "Sector 15-A/5",
      "Sector 15-B",
      "Sector 16-A",
      "Sector 16-B",
    ],
    "Karachi::Gulshan-e-Hadeed": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
      "Steel Town",
      "Shah Latif Town",
      "Data Nagar",
      "Gulshan-e-Mauzzam",
      "Gulshan-e-Rehman",
      "Mehran Road",
    ],
    "Karachi::Garden": [
      "Garden East",
      "Garden West",
      "Soldier Bazaar",
    ],
    "Karachi::Orangi Town": [
      "Sector 14-A",
      "Sector 14-C",
      "Banaras Town",
      "Bangla Bazaar",
      "Bilal Colony",
      "Katti Pahari",
      "Moria Goth",
      "Orangi",
    ],
    "Karachi::Saddar": [
      "Saddar",
      "Kharadar",
      "Mithadar",
      "Jodia Bazar",
      "Bombay Bazar",
      "Lee Market",
      "Bohri Bazaar",
      "Ranchore Line",
      "Nanakwara",
      "Nishtar Road",
      "Pan Mandi",
      "Kagzi Bazar",
      "Kakri Ground",
      "Aram Bagh",
      "Napier Quarter",
      "Civil Line",
      "I.I. Chundrigar Road",
    ],
    "Karachi::KAECHS": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
    ],
    "Karachi::Gulshan-e-Maymar": [
      "Sector W",
      "Sector X",
      "Sector Y",
      "Sector Z",
    ],
    "Karachi::Scheme 33": [
      "Sector 14-A",
      "Sector 15-A",
      "Sector 17-A",
      "Sector 20-A",
      "Sector 21-A",
      "Sector 22-A",
      "Sector 23-A",
      "Sector 24-A",
      "Sector 25-A",
      "Sector 34-A",
    ],
    "Karachi::New Karachi": [
      "Sector 1",
      "Sector 2",
      "Sector 3",
      "Sector 4",
      "Sector 5",
    ],
    "Karachi::Defence View": [
      "Phase 1",
      "Phase 2",
    ],
    "Karachi::Gulzar-e-Hijri": [
      "Scheme 33 Extension",
      "Main Area",
    ],
    "Karachi::Surjani Town": [
      "Sector 1",
      "Sector 2",
      "Sector 3",
      "Sector 4",
      "Sector 5",
      "Sector 6",
      "Sector 7",
      "Sector 8",
    ],
    "Karachi::Naya Nazimabad": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block M",
    ],
    "Islamabad::Sector E-7": [
      "E-7/1",
      "E-7/2",
      "E-7/3",
      "E-7/4",
    ],
    "Islamabad::Sector E-8": [
      "E-8/1",
      "E-8/2",
      "E-8/3",
      "E-8/4",
    ],
    "Islamabad::Sector E-9": [
      "E-9/1",
      "E-9/2",
      "E-9/3",
      "E-9/4",
    ],
    "Islamabad::Sector E-10": [
      "E-10/1",
      "E-10/2",
      "E-10/3",
      "E-10/4",
    ],
    "Islamabad::Sector E-11": [
      "E-11/1",
      "E-11/2",
      "E-11/3",
      "E-11/4",
    ],
    "Islamabad::Sector E-12": [
      "E-12/1",
      "E-12/2",
      "E-12/3",
      "E-12/4",
    ],
    "Islamabad::Sector E-16": [
      "E-16/1",
      "E-16/2",
      "E-16/3",
      "E-16/4",
    ],
    "Islamabad::Sector E-17": [
      "E-17/1",
      "E-17/2",
      "E-17/3",
      "E-17/4",
    ],
    "Islamabad::Sector F-5": [
      "F-5/1",
      "F-5/2",
      "F-5/3",
      "F-5/4",
    ],
    "Islamabad::Sector F-6": [
      "F-6/1",
      "F-6/2",
      "F-6/3",
      "F-6/4",
      "F-6 Markaz (Super Market)",
    ],
    "Islamabad::Sector F-7": [
      "F-7/1",
      "F-7/2",
      "F-7/3",
      "F-7/4",
      "F-7 Markaz (Jinnah Super)",
    ],
    "Islamabad::Sector F-8": [
      "F-8/1",
      "F-8/2",
      "F-8/3",
      "F-8/4",
      "F-8 Markaz",
    ],
    "Islamabad::Sector F-9 (Fatima Jinnah Park)": [
      "F-9/1",
      "F-9/2",
      "F-9/3",
      "F-9/4",
      "F-9 Park",
    ],
    "Islamabad::Sector F-10": [
      "F-10/1",
      "F-10/2",
      "F-10/3",
      "F-10/4",
      "F-10 Markaz",
    ],
    "Islamabad::Sector F-11": [
      "F-11/1",
      "F-11/2",
      "F-11/3",
      "F-11/4",
      "F-11 Markaz",
    ],
    "Islamabad::Sector F-17": [
      "F-17/1",
      "F-17/2",
      "F-17/3",
      "F-17/4",
    ],
    "Islamabad::Sector G-5": [
      "G-5/1",
      "G-5/2",
      "G-5/3",
      "G-5/4",
    ],
    "Islamabad::Sector G-6": [
      "G-6/1",
      "G-6/2",
      "G-6/3",
      "G-6/4",
      "G-6 Markaz (Melody Market)",
    ],
    "Islamabad::Sector G-7": [
      "G-7/1",
      "G-7/2",
      "G-7/3",
      "G-7/4",
    ],
    "Islamabad::Sector G-8": [
      "G-8/1",
      "G-8/2",
      "G-8/3",
      "G-8/4",
      "G-8 Markaz",
    ],
    "Islamabad::Sector G-9": [
      "G-9/1",
      "G-9/2",
      "G-9/3",
      "G-9/4",
      "G-9 Markaz (Karachi Company)",
    ],
    "Islamabad::Sector G-10": [
      "G-10/1",
      "G-10/2",
      "G-10/3",
      "G-10/4",
      "G-10 Markaz",
    ],
    "Islamabad::Sector G-11": [
      "G-11/1",
      "G-11/2",
      "G-11/3",
      "G-11/4",
      "G-11 Markaz",
    ],
    "Islamabad::Sector G-12": [
      "G-12/1",
      "G-12/2",
      "G-12/3",
      "G-12/4",
    ],
    "Islamabad::Sector G-13": [
      "G-13/1",
      "G-13/2",
      "G-13/3",
      "G-13/4",
    ],
    "Islamabad::Sector G-14": [
      "G-14/1",
      "G-14/2",
      "G-14/3",
      "G-14/4",
    ],
    "Islamabad::Sector G-15": [
      "G-15/1",
      "G-15/2",
      "G-15/3",
      "G-15/4",
    ],
    "Islamabad::Sector G-16": [
      "G-16/1",
      "G-16/2",
      "G-16/3",
      "G-16/4",
    ],
    "Islamabad::Sector H-8": [
      "H-8/1",
      "H-8/2",
      "H-8/3",
      "H-8/4",
    ],
    "Islamabad::Sector H-9": [
      "H-9/1",
      "H-9/2",
      "H-9/3",
      "H-9/4",
    ],
    "Islamabad::Sector H-10": [
      "H-10/1",
      "H-10/2",
      "H-10/3",
      "H-10/4",
    ],
    "Islamabad::Sector H-11": [
      "H-11/1",
      "H-11/2",
      "H-11/3",
      "H-11/4",
    ],
    "Islamabad::Sector H-12": [
      "H-12/1",
      "H-12/2",
      "H-12/3",
      "H-12/4",
    ],
    "Islamabad::Sector H-13": [
      "H-13/1",
      "H-13/2",
      "H-13/3",
      "H-13/4",
    ],
    "Islamabad::Sector I-8": [
      "I-8/1",
      "I-8/2",
      "I-8/3",
      "I-8/4",
      "I-8 Markaz",
    ],
    "Islamabad::Sector I-9": [
      "I-9/1",
      "I-9/2",
      "I-9/3",
      "I-9/4",
      "I-9 Industrial Area",
    ],
    "Islamabad::Sector I-10": [
      "I-10/1",
      "I-10/2",
      "I-10/3",
      "I-10/4",
      "I-10 Markaz",
    ],
    "Islamabad::Sector I-11": [
      "I-11/1",
      "I-11/2",
      "I-11/3",
      "I-11/4",
    ],
    "Islamabad::Sector I-12": [
      "I-12/1",
      "I-12/2",
      "I-12/3",
      "I-12/4",
    ],
    "Islamabad::Sector I-14": [
      "I-14/1",
      "I-14/2",
      "I-14/3",
      "I-14/4",
    ],
    "Islamabad::Sector I-15": [
      "I-15/1",
      "I-15/2",
      "I-15/3",
      "I-15/4",
    ],
    "Islamabad::Sector I-16": [
      "I-16/1",
      "I-16/2",
      "I-16/3",
      "I-16/4",
    ],
    "Islamabad::Blue Area": [
      "Jinnah Avenue",
      "Blue Area Commercial",
    ],
    "Islamabad::Sector D-12": [
      "D-12/1",
      "D-12/2",
      "D-12/3",
      "D-12/4",
    ],
    "Islamabad::Sector D-17": [
      "D-17/1",
      "D-17/2",
    ],
    "Islamabad::Sector C-14": [
      "C-14/1",
      "C-14/2",
      "C-14/3",
      "C-14/4",
    ],
    "Islamabad::Sector C-15": [
      "C-15/1",
      "C-15/2",
      "C-15/3",
      "C-15/4",
    ],
    "Islamabad::Sector B-17": [
      "Block A",
      "Block B",
      "Block C",
      "Block C-1",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
    ],
    "Islamabad::DHA Islamabad": [
      "Phase 1",
      "Phase 2",
      "Phase 2 Extension",
      "Phase 3",
      "Phase 4",
      "Phase 5",
      "DHA Valley",
    ],
    "Islamabad::Bahria Town Islamabad": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
      "Phase 4",
      "Phase 5",
      "Phase 6",
      "Phase 7",
      "Phase 8",
      "Bahria Enclave - Sector A",
      "Bahria Enclave - Sector B",
      "Bahria Enclave - Sector C",
      "Bahria Enclave - Sector D",
      "Bahria Enclave - Sector E",
      "Bahria Enclave - Sector F",
      "Bahria Enclave - Sector G",
      "Bahria Enclave - Sector H",
      "Bahria Enclave - Sector I",
      "Bahria Enclave - Sector N",
      "Civic Center",
      "Safari Valley",
      "Safari Villas",
      "Bahria Spring",
      "Bahria Garden City",
    ],
    "Islamabad::PWD Housing Scheme": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Islamabad::Pakistan Town": [
      "Phase 1",
      "Phase 2",
    ],
    "Islamabad::CBR Town": [
      "Phase 1",
      "Phase 2",
    ],
    "Islamabad::Gulberg Greens": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Islamabad::Gulberg Residencia": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Block H",
      "Block I",
    ],
    "Islamabad::Top City": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Islamabad::Capital Smart City": [
      "Executive Block",
      "Overseas Block",
      "General Block",
      "Harmony Park",
      "Overseas East",
    ],
    "Rawalpindi::Satellite Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
    ],
    "Rawalpindi::Bahria Town Phase 8": [
      "Umer Block",
      "Ali Block",
      "Abu Baker Block",
      "Usman Block",
      "Rafi Block",
      "Khalid Block",
      "Awami Villas",
      "Lake View",
      "Safari Home",
      "Overseas Enclave",
    ],
    "Rawalpindi::Chaklala Scheme 3": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
    ],
    "Rawalpindi::Askari": [
      "Askari 1",
      "Askari 2",
      "Askari 3",
      "Askari 5",
      "Askari 11",
      "Askari 14",
    ],
    "Rawalpindi::Westridge": [
      "Block 1",
      "Block 2",
      "Block 3",
    ],
    "Rawalpindi::Adiala Road": [
      "Gulraiz Housing Society Phase 1",
      "Gulraiz Housing Society Phase 2",
      "Gulraiz Housing Society Phase 3",
      "Gulraiz Housing Society Phase 4",
      "Gulraiz Housing Society Phase 5",
      "Media Town",
      "Airport Housing Society",
    ],
    "Rawalpindi::Saddar": [
      "Saddar Main",
      "Committee Chowk",
      "Bank Road",
      "Murree Road",
      "Haider Road",
    ],
    "Rawalpindi::Rawalpindi Cantt": [
      "Mall Road",
      "The Mall",
      "Cantt Bazaar",
      "Chaklala Cantt",
    ],
    "Faisalabad::Peoples Colony": [
      "No. 1",
      "No. 2",
    ],
    "Faisalabad::Madina Town": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
    ],
    "Faisalabad::Gulberg": [
      "Block A",
      "Block B",
      "Block C",
    ],
    "Faisalabad::Samanabad": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Faisalabad::Ghulam Muhammad Abad": [
      "Phase 1",
      "Phase 2",
    ],
    "Faisalabad::Batala Colony": [
      "Old Batala Colony",
      "New Batala Colony",
    ],
    "Faisalabad::Jinnah Colony": [
      "Block A",
      "Block B",
      "Block C",
    ],
    "Faisalabad::Eden Valley": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Faisalabad::Citi Housing": [
      "Phase 1",
      "Phase 2",
      "Phase 3",
    ],
    "Faisalabad::Wapda City": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Peshawar::Hayatabad": [
      "Phase 1 - Sector E-1",
      "Phase 1 - Sector E-2",
      "Phase 1 - Sector E-3",
      "Phase 1 - Sector E-4",
      "Phase 1 - Sector E-5",
      "Phase 2 - Sector E-6",
      "Phase 2 - Sector E-7",
      "Phase 2 - Sector E-8",
      "Phase 3 - Sector E-9",
      "Phase 3 - Sector E-10",
      "Phase 4 - Sector D-1",
      "Phase 4 - Sector D-2",
      "Phase 4 - Sector D-3",
      "Phase 5 - Sector D-4",
      "Phase 5 - Sector D-5",
      "Phase 6 - Sector F-1",
      "Phase 6 - Sector F-2",
      "Phase 6 - Sector F-3",
      "Phase 6 - Sector F-5",
      "Phase 6 - Sector F-6",
      "Phase 6 - Sector F-7",
      "Phase 6 - Sector F-8",
      "Phase 7 - Sector F-9",
      "Phase 7 - Sector F-10",
    ],
    "Peshawar::University Town": [
      "Main University Town",
      "Abdara Road",
      "Arbab Road",
      "University Road",
    ],
    "Peshawar::Peshawar Cantt": [
      "Cantt Main",
      "Saddar",
      "Mall Road",
    ],
    "Peshawar::DHA Peshawar": [
      "Sector A",
      "Sector B",
      "Sector C",
      "Sector D",
      "Sector E",
      "Sector F",
      "Sector G",
    ],
    "Peshawar::Regi Model Town": [
      "Zone 1",
      "Zone 2",
      "Zone 3",
      "Zone 4",
      "Zone 5",
    ],
    "Peshawar::Warsak Road": [
      "Board Bazaar",
      "Danish Abad",
      "Gulbahar",
      "Shahi Bagh",
    ],
    "Quetta::Satellite Town": [
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
    ],
    "Quetta::Cantonment": [
      "Cantt Main",
      "Jinnah Road",
      "Staff College Road",
    ],
    "Quetta::Samungli": [
      "Samungli Road",
      "Airport Road",
      "PAF Base",
    ],
    "Multan::DHA Multan": [
      "Sector A",
      "Sector B",
      "Sector C",
      "Sector D",
      "Sector E",
      "Sector F",
      "Sector G",
      "Sector H",
      "Sector I",
      "Sector J",
      "Sector K",
      "Sector L",
      "Sector M",
      "Sector N",
      "Sector P",
      "Sector Q",
      "Sector R",
      "Sector S",
      "Sector T",
      "Sector U",
      "Sector V",
      "Villas Sector",
    ],
    "Multan::Bosan Road": [
      "Block A",
      "Block B",
      "Block C",
    ],
    "Multan::Shah Rukn-e-Alam Colony": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
      "Block E",
      "Block F",
      "Block G",
      "Extension",
    ],
    "Multan::Gulgasht Colony": [
      "Block A",
      "Block B",
      "Block C",
      "Block D",
    ],
    "Multan::Wapda Town": [
      "Phase 1",
      "Phase 2",
    ],
    "Multan::Officers Colony": [
      "Block A",
      "Block B",
      "Block C",
    ],
    "Multan::Model Town": [
      "Block A",
      "Block B",
      "Block C",
    ],
    "Multan::Citi Housing Multan": [
      "Phase 1",
      "Phase 2",
    ],
    "Hyderabad::Latifabad": [
      "Unit 1",
      "Unit 2",
      "Unit 3",
      "Unit 4",
      "Unit 5",
      "Unit 6",
      "Unit 7",
      "Unit 8",
      "Unit 9",
      "Unit 10",
      "Unit 11",
      "Unit 12",
    ],
    "Hyderabad::Qasimabad": [
      "Phase 1",
      "Phase 2",
      "Revenue Housing Society",
      "Naseem Nagar",
      "Alamdar Chowk",
    ],
    "Hyderabad::Cantonment": [
      "Cantt Main",
      "Saddar",
      "Thandi Sarak",
    ],
    "Hyderabad::Gulshan-e-Shahbaz": [
      "Phase 1",
      "Phase 2",
    ],
  },
};

export function getCitiesForProvince(province: string): string[] {
  return PAKISTAN_LOCATIONS.cities[province] ?? [];
}

export function getTownsForCity(city: string): string[] {
  return PAKISTAN_LOCATIONS.towns[city] ?? [];
}

/** Returns true only for cities that have a defined towns list */
export function cityHasTowns(city: string): boolean {
  return city in PAKISTAN_LOCATIONS.towns;
}

/** True when `town` is a canonical town of `city`. */
export function isCanonicalTown(city: string, town: string): boolean {
  if (!city || !town) return false;
  return getTownsForCity(city).includes(town);
}

/**
 * True when a saved location predates the canonical town list and needs the
 * user to re-pick it.
 *
 * Builds before the sub-area work wrote free-text towns straight into `town`,
 * and the town list was later renamed to align with the sub-area data ("F-6"
 * became "Sector F-6"). Either way the result is a non-empty `town` that is not
 * canonical for its city — a state the current client can no longer produce,
 * since free text now goes to `townOther`. So this doubles as the "written by
 * an old build" test.
 */
export function isLegacyTownValue(city: string, town: string): boolean {
  if (!town) return false;
  if (!cityHasTowns(city)) return false; // no list to judge against
  return !isCanonicalTown(city, town);
}

/** Composite key for the subAreas map. Town names repeat across cities. */
export function subAreaKey(city: string, town: string): string {
  return `${city}::${town}`;
}

/**
 * Canonical sub-areas (block / sector / phase) for a town.
 * Returns [] when the town has no sub-area data — callers should skip the
 * sub-area step entirely in that case rather than render an empty dropdown.
 */
export function getSubAreasForTown(city: string, town: string): string[] {
  if (!city || !town) return [];
  return PAKISTAN_LOCATIONS.subAreas[subAreaKey(city, town)] ?? [];
}

/** True when this town has at least one canonical sub-area. */
export function townHasSubAreas(city: string, town: string): boolean {
  return getSubAreasForTown(city, town).length > 0;
}

/**
 * True when a sub-area can be asked for — and therefore required — at this
 * location. False for a free-text town (which arrives here as an empty `town`,
 * since the value lives in `townOther`) and for canonical towns with no
 * sub-area data: neither has a list to choose from, so there is no answer to
 * demand.
 *
 * Single source of truth for the required rule. The edit form and the
 * profile-completeness check both read it so they cannot disagree about
 * whether a blank sub-area is a gap or simply not applicable.
 */
export function requiresSubArea(city: string, town: string): boolean {
  return isCanonicalTown(city, town) && townHasSubAreas(city, town);
}

/**
 * Folds a name to a comparable form: lowercased, punctuation and spacing
 * removed. Canonical names carry inconsistent punctuation ("Federal B. Area",
 * "DHA (Defence Housing Authority)", "Gulshan-e-Iqbal"), so comparing raw text
 * would miss obvious matches for what a user actually types.
 */
export function foldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Shortest query worth matching on — below this nearly everything matches. */
const MIN_MATCH_QUERY = 2;

/**
 * Canonical names from `options` that look like what the user typed.
 *
 * Suggestions are drawn only from the array passed in, so every one traces back
 * to this file. Ranked exact fold-match, then prefix, then interior: someone
 * who typed "dha" as free text most needs to be shown the canonical "DHA", so
 * an exact match leads rather than being filtered out as redundant.
 *
 * Returns [] for queries shorter than MIN_MATCH_QUERY.
 */
export function matchCanonicalNames(
  options: string[],
  query: string,
  limit = 5,
): string[] {
  const needle = foldName(query || "");
  if (needle.length < MIN_MATCH_QUERY) return [];

  const exact: string[] = [];
  const prefix: string[] = [];
  const interior: string[] = [];

  for (const option of options) {
    const hay = foldName(option);
    if (hay === needle) exact.push(option);
    else if (hay.startsWith(needle)) prefix.push(option);
    else if (hay.includes(needle)) interior.push(option);
  }

  return [...exact, ...prefix, ...interior].slice(0, limit);
}

// ===========================================================================
// Metadata layer (P0.2)
// ===========================================================================
// Additive side-car maps over PAKISTAN_LOCATIONS. Nothing above this line is
// modified, and nothing here changes what `getSubAreasForTown` returns.
//
// WHY SIDE-CAR RATHER THAN RESTRUCTURING: `isLegacyTownValue` treats any stored
// town that is not in the canonical list as stale, which forces that user
// through LocationUpdateModal. Renaming or removing a single string therefore
// invalidates every profile using it. The data above is effectively frozen —
// these maps hang metadata off it by key instead of touching it.

export type CoverageTier = "A" | "B" | "C";

export interface AreaMeta {
  /**
   * Whether reverse geocoding resolves reliably here (P0.1c).
   *
   * Defaults to false for EVERY area and is promoted only on evidence: the
   * spike can only sample areas we actually serve, and defaulting untested
   * areas to true would ship auto-fill into areas never measured.
   */
  geocodeReliable: boolean;
  /**
   * What the sub-area field should call itself in this area — "Block",
   * "Phase", "Sector", "Precinct", "Unit", "Zone", "Sub-sector", or the
   * generic "Area".
   *
   * Derived from the dominant idiom of the area's own sub-area list, never
   * from the city: Karachi alone contains Blocks (Gulshan-e-Iqbal), Phases
   * (DHA), Precincts (Bahria Town) and Sectors (North Karachi). Areas whose
   * list mixes levels, or is made of named places rather than numbered units,
   * get "Area" — asking a Saddar resident for their "Block" reads as a broken
   * form.
   */
  blockLabel: string;
  /** Geocoder strings that resolve to this area. Seeded from the P0.1a unmatched log. */
  aliases?: readonly string[];
}

export const CITY_COVERAGE_TIER: Record<string, CoverageTier> = {
  "Karachi": "A",
  "Lahore": "B",
  "Islamabad": "B",
};

export const AREA_META: Record<string, AreaMeta> = {
  "Lahore::DHA Lahore": { geocodeReliable: false, blockLabel: "Area" },
  "Lahore::Bahria Town Lahore": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Gulberg": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Model Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Johar Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Wapda Town": { geocodeReliable: false, blockLabel: "Area" },
  "Lahore::Garden Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Township": { geocodeReliable: false, blockLabel: "Sector" },
  "Lahore::Cantt": { geocodeReliable: false, blockLabel: "Area" },
  "Lahore::Iqbal Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Faisal Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::EME Society": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Valencia Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::PCSIR Housing Scheme": { geocodeReliable: false, blockLabel: "Phase" },
  "Lahore::Punjab Cooperative Housing Society (PCHS)": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Cavalry Ground": { geocodeReliable: false, blockLabel: "Area" },
  "Lahore::Sui Gas Society": { geocodeReliable: false, blockLabel: "Phase" },
  "Lahore::Lake City": { geocodeReliable: false, blockLabel: "Sector" },
  "Lahore::State Life Housing Society": { geocodeReliable: false, blockLabel: "Phase" },
  "Lahore::PGEHS (Punjab Govt Employees Housing Scheme)": { geocodeReliable: false, blockLabel: "Phase" },
  "Lahore::LDA Avenue": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Jubilee Town": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Sabzazar": { geocodeReliable: false, blockLabel: "Block" },
  "Lahore::Shahdara": { geocodeReliable: false, blockLabel: "Area" },
  "Lahore::Shadman": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::DHA": { geocodeReliable: false, blockLabel: "Phase" },
  "Karachi::Clifton": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::PECHS": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Gulshan-e-Iqbal": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Gulistan-e-Jauhar": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::North Karachi": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::North Nazimabad": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Nazimabad": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Federal B. Area": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Liaquatabad": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Korangi": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Landhi": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Malir": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Shah Faisal Colony": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Bahria Town Karachi": { geocodeReliable: false, blockLabel: "Precinct" },
  "Karachi::Askari": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Buffer Zone": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Gulshan-e-Hadeed": { geocodeReliable: false, blockLabel: "Phase" },
  "Karachi::Garden": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Orangi Town": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Saddar": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::KAECHS": { geocodeReliable: false, blockLabel: "Block" },
  "Karachi::Gulshan-e-Maymar": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Scheme 33": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::New Karachi": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Defence View": { geocodeReliable: false, blockLabel: "Phase" },
  "Karachi::Gulzar-e-Hijri": { geocodeReliable: false, blockLabel: "Area" },
  "Karachi::Surjani Town": { geocodeReliable: false, blockLabel: "Sector" },
  "Karachi::Naya Nazimabad": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::Sector E-7": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-8": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-9": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-10": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-11": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-12": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-16": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector E-17": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-5": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-6": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-7": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-8": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-9 (Fatima Jinnah Park)": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-10": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-11": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector F-17": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-5": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-6": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-7": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-8": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-9": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-10": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-11": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-12": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-13": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-14": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-15": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector G-16": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-8": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-9": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-10": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-11": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-12": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector H-13": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-8": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-9": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-10": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-11": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-12": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-14": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-15": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector I-16": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Blue Area": { geocodeReliable: false, blockLabel: "Area" },
  "Islamabad::Sector D-12": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector D-17": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector C-14": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector C-15": { geocodeReliable: false, blockLabel: "Sub-sector" },
  "Islamabad::Sector B-17": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::DHA Islamabad": { geocodeReliable: false, blockLabel: "Phase" },
  "Islamabad::Bahria Town Islamabad": { geocodeReliable: false, blockLabel: "Area" },
  "Islamabad::PWD Housing Scheme": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::Pakistan Town": { geocodeReliable: false, blockLabel: "Phase" },
  "Islamabad::CBR Town": { geocodeReliable: false, blockLabel: "Phase" },
  "Islamabad::Gulberg Greens": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::Gulberg Residencia": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::Top City": { geocodeReliable: false, blockLabel: "Block" },
  "Islamabad::Capital Smart City": { geocodeReliable: false, blockLabel: "Block" },
  "Rawalpindi::Satellite Town": { geocodeReliable: false, blockLabel: "Block" },
  "Rawalpindi::Bahria Town Phase 8": { geocodeReliable: false, blockLabel: "Block" },
  "Rawalpindi::Chaklala Scheme 3": { geocodeReliable: false, blockLabel: "Block" },
  "Rawalpindi::Askari": { geocodeReliable: false, blockLabel: "Area" },
  "Rawalpindi::Westridge": { geocodeReliable: false, blockLabel: "Block" },
  "Rawalpindi::Adiala Road": { geocodeReliable: false, blockLabel: "Phase" },
  "Rawalpindi::Saddar": { geocodeReliable: false, blockLabel: "Area" },
  "Rawalpindi::Rawalpindi Cantt": { geocodeReliable: false, blockLabel: "Area" },
  "Faisalabad::Peoples Colony": { geocodeReliable: false, blockLabel: "Area" },
  "Faisalabad::Madina Town": { geocodeReliable: false, blockLabel: "Block" },
  "Faisalabad::Gulberg": { geocodeReliable: false, blockLabel: "Block" },
  "Faisalabad::Samanabad": { geocodeReliable: false, blockLabel: "Block" },
  "Faisalabad::Ghulam Muhammad Abad": { geocodeReliable: false, blockLabel: "Phase" },
  "Faisalabad::Batala Colony": { geocodeReliable: false, blockLabel: "Area" },
  "Faisalabad::Jinnah Colony": { geocodeReliable: false, blockLabel: "Block" },
  "Faisalabad::Eden Valley": { geocodeReliable: false, blockLabel: "Block" },
  "Faisalabad::Citi Housing": { geocodeReliable: false, blockLabel: "Phase" },
  "Faisalabad::Wapda City": { geocodeReliable: false, blockLabel: "Block" },
  "Peshawar::Hayatabad": { geocodeReliable: false, blockLabel: "Area" },
  "Peshawar::University Town": { geocodeReliable: false, blockLabel: "Area" },
  "Peshawar::Peshawar Cantt": { geocodeReliable: false, blockLabel: "Area" },
  "Peshawar::DHA Peshawar": { geocodeReliable: false, blockLabel: "Sector" },
  "Peshawar::Regi Model Town": { geocodeReliable: false, blockLabel: "Zone" },
  "Peshawar::Warsak Road": { geocodeReliable: false, blockLabel: "Area" },
  "Quetta::Satellite Town": { geocodeReliable: false, blockLabel: "Block" },
  "Quetta::Cantonment": { geocodeReliable: false, blockLabel: "Area" },
  "Quetta::Samungli": { geocodeReliable: false, blockLabel: "Area" },
  "Multan::DHA Multan": { geocodeReliable: false, blockLabel: "Sector" },
  "Multan::Bosan Road": { geocodeReliable: false, blockLabel: "Block" },
  "Multan::Shah Rukn-e-Alam Colony": { geocodeReliable: false, blockLabel: "Block" },
  "Multan::Gulgasht Colony": { geocodeReliable: false, blockLabel: "Block" },
  "Multan::Wapda Town": { geocodeReliable: false, blockLabel: "Phase" },
  "Multan::Officers Colony": { geocodeReliable: false, blockLabel: "Block" },
  "Multan::Model Town": { geocodeReliable: false, blockLabel: "Block" },
  "Multan::Citi Housing Multan": { geocodeReliable: false, blockLabel: "Phase" },
  "Hyderabad::Latifabad": { geocodeReliable: false, blockLabel: "Unit" },
  "Hyderabad::Qasimabad": { geocodeReliable: false, blockLabel: "Phase" },
  "Hyderabad::Cantonment": { geocodeReliable: false, blockLabel: "Area" },
  "Hyderabad::Gulshan-e-Shahbaz": { geocodeReliable: false, blockLabel: "Phase" },
};

const DEPRECATED_SUB_AREA_VALUES: Record<string, readonly string[]> = {
  "Lahore::Gulberg": ["Hussain Chowk", "Liberty Market", "Main Boulevard Gulberg", "MM Alam Road"],
  "Lahore::Model Town": ["Model Town Link Road"],
  "Lahore::Lake City": ["Raiwind Road"],
  "Karachi::PECHS": ["Khalid Bin Walid Road", "Tariq Road"],
  "Karachi::Gulshan-e-Iqbal": ["University Road"],
  "Karachi::Gulshan-e-Hadeed": ["Mehran Road"],
  "Karachi::Orangi Town": ["Bangla Bazaar"],
  "Hyderabad::Qasimabad": ["Alamdar Chowk"],
};

// ---------------------------------------------------------------------------
// Centroids — populated by the P0.1a sweep. Empty until it runs.
// ---------------------------------------------------------------------------
// Deliberately empty rather than guessed. Every consumer must handle a missing
// centroid anyway (the registry will always outrun the survey), so shipping
// them empty exercises that path from day one instead of hiding it.

/** City name -> [lng, lat], GeoJSON order. */
export const CITY_CENTROIDS: Record<string, readonly [number, number]> = {};

/** `${city}::${town}` -> [lng, lat], GeoJSON order. */
export const AREA_CENTROIDS: Record<string, readonly [number, number]> = {};

// ---------------------------------------------------------------------------
// Province derivation
// ---------------------------------------------------------------------------

/**
 * City -> province, inverted from PAKISTAN_LOCATIONS.cities at module load.
 *
 * Computed rather than written out: a hand-maintained copy is a second source
 * of truth that can silently disagree with the first. Every city sits under
 * exactly one province, so the inversion is lossless (asserted in tests).
 */
export const PROVINCE_BY_CITY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [province, cities] of Object.entries(PAKISTAN_LOCATIONS.cities)) {
    for (const city of cities) map[city] = province;
  }
  return map;
})();

/**
 * The province a city belongs to, or null when the city is not in the registry.
 *
 * The null case is not theoretical. City is a closed list today, so a user
 * whose city is absent has no way through — and if a `cityOther` escape is ever
 * added, this returns null, `province` goes empty, and `isProfileComplete`
 * fails. Callers must handle null rather than assuming a string.
 */
export function getProvinceForCity(city: string): string | null {
  return PROVINCE_BY_CITY[(city || "").trim()] ?? null;
}

// ---------------------------------------------------------------------------
// Metadata accessors — every one is total, defaulting safely on unknown keys
// ---------------------------------------------------------------------------

const DEFAULT_AREA_META: AreaMeta = {
  geocodeReliable: false,
  blockLabel: "Area",
  aliases: [],
};

/**
 * Operational tier for a city: whether collections run there, or are planned.
 *
 * NOT the same axis as registry depth — use `cityHasTowns` for that. A city can
 * have full town data and no operations (Gujranwala), or become tier A the
 * month operations open with no registry change at all. Unlisted cities are C.
 */
export function getCoverageTier(city: string): CoverageTier {
  return CITY_COVERAGE_TIER[(city || "").trim()] ?? "C";
}

/** Metadata for an area, or safe defaults when it has no sub-area data. */
export function getAreaMeta(city: string, town: string): AreaMeta {
  return AREA_META[subAreaKey(city, town)] ?? DEFAULT_AREA_META;
}

/** What to call the sub-area field for this area. Never city-derived. */
export function getBlockLabel(city: string, town: string): string {
  return getAreaMeta(city, town).blockLabel;
}

/** Centroid for an area, or null. Null is the common case until P0.1a runs. */
export function getAreaCentroid(
  city: string,
  town: string,
): readonly [number, number] | null {
  return AREA_CENTROIDS[subAreaKey(city, town)] ?? null;
}

/** Centroid for a city, or null. */
export function getCityCentroid(city: string): readonly [number, number] | null {
  return CITY_CENTROIDS[(city || "").trim()] ?? null;
}

// ---------------------------------------------------------------------------
// Deprecated sub-areas
// ---------------------------------------------------------------------------

/**
 * True when a sub-area is hidden from NEW selections.
 *
 * These are entries that name a road or a market rather than an addressable
 * area — "MM Alam Road", "Tariq Road", "Liberty Market". Picking one produces a
 * value that looks structured and is not, which matters under a hard gate.
 *
 * They are hidden, never removed. `getSubAreasForTown` still returns them, so
 * `isLegacyTownValue` and the sub-area validation in utils/profile.ts continue
 * to accept them and no existing user is forced to re-pick. The backfill audit
 * (P3.1) prompts those users specifically instead.
 */
export function isDeprecatedSubArea(
  city: string,
  town: string,
  subArea: string,
): boolean {
  const values = DEPRECATED_SUB_AREA_VALUES[subAreaKey(city, town)];
  return values ? values.includes((subArea || "").trim()) : false;
}

/**
 * Sub-areas to OFFER in the picker: canonical minus deprecated.
 *
 * Distinct from `getSubAreasForTown`, which is the validation view and must
 * keep returning everything. Use this one for rendering, that one for deciding
 * whether a stored value is still valid — conflating them either shows users
 * roads to pick, or invalidates the profiles of users who already picked one.
 */
export function getSelectableSubAreasForTown(
  city: string,
  town: string,
): string[] {
  const all = getSubAreasForTown(city, town);
  const deprecated = DEPRECATED_SUB_AREA_VALUES[subAreaKey(city, town)];
  if (!deprecated || deprecated.length === 0) return all;
  return all.filter((value) => !deprecated.includes(value));
}

// ---------------------------------------------------------------------------
// Geocoder name resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a raw geocoder locality to a canonical town name, or null.
 *
 * Order: exact -> folded -> alias -> fail. A failed resolution is a MISS, not a
 * partial hit: never write a raw geocoder string into `town`, the same
 * invariant `buildPayload` already enforces for user input. Callers log the
 * miss (it seeds the alias table) and fall back to asking the user.
 *
 * `city` narrows the search when known. Without it a town name that repeats
 * across cities cannot be resolved, so an ambiguous match returns null rather
 * than guessing — the composite "City::Town" key exists precisely because
 * "Cantt", "Model Town" and "Satellite Town" are not unique.
 */
export function resolveGeocodedName(
  raw: string,
  city?: string,
): string | null {
  const value = (raw || "").trim();
  if (!value) return null;

  const candidateCities = city?.trim()
    ? [city.trim()]
    : Object.keys(PAKISTAN_LOCATIONS.towns);

  const needle = foldName(value);
  // Keyed by "City::Town", not by town name: "Cantt", "Model Town" and
  // "Satellite Town" each exist in several cities, and deduping on the bare
  // name would silently collapse four different places into one confident
  // answer. That is the exact failure the composite key exists to prevent.
  const matches = new Map<string, string>();

  for (const candidateCity of candidateCities) {
    for (const town of getTownsForCity(candidateCity)) {
      const key = subAreaKey(candidateCity, town);
      if (town === value || foldName(town) === needle) {
        matches.set(key, town);
        continue;
      }
      const aliases = AREA_META[key]?.aliases;
      if (aliases?.some((alias) => foldName(alias) === needle)) {
        matches.set(key, town);
      }
    }
  }

  // Ambiguous across cities is a miss, not a coin flip.
  return matches.size === 1 ? [...matches.values()][0] : null;
}
