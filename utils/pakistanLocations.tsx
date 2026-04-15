export interface LocationData {
  provinces: string[];
  cities: Record<string, string[]>;
  towns: Record<string, string[]>;
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
    "Islamabad Capital Territory": ["Islamabad"],
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
    // Lahore
    Lahore: [
      "DHA",
      "Gulberg",
      "Model Town",
      "Johar Town",
      "Bahria Town",
      "Cantt",
      "Iqbal Town",
      "Garden Town",
      "Wapda Town",
      "Township",
      "Shadman",
      "Allama Iqbal Town",
      "Faisal Town",
      "Samanabad",
      "Raiwind",
    ],
    // Karachi
    Karachi: [
      "Clifton",
      "DHA",
      "Gulshan-e-Iqbal",
      "PECHS",
      "North Nazimabad",
      "Korangi",
      "Landhi",
      "Malir",
      "Orangi",
      "Liaquatabad",
      "Nazimabad",
      "Saddar",
      "Defence",
      "Bahria Town",
      "Scheme 33",
    ],
    // Islamabad
    Islamabad: [
      "F-6",
      "F-7",
      "F-8",
      "F-10",
      "F-11",
      "G-6",
      "G-7",
      "G-8",
      "G-9",
      "G-10",
      "G-11",
      "G-13",
      "I-8",
      "I-10",
      "Bahria Town",
      "DHA",
      "Blue Area",
      "Bani Gala",
      "Margalla Town",
    ],
    // Rawalpindi
    Rawalpindi: [
      "Saddar",
      "Cantt",
      "Bahria Town",
      "DHA",
      "Satellite Town",
      "Chaklala",
      "Gulzar-e-Quaid",
      "Gulshan Abad",
      "Raja Bazaar",
      "Pirwadhai",
    ],
    // Faisalabad
    Faisalabad: [
      "Madina Town",
      "Gulberg",
      "Samanabad",
      "Jinnah Colony",
      "Peoples Colony",
      "Susan Road",
      "Millat Town",
      "Canal Road",
      "Tariq Abad",
      "Civil Lines",
    ],
    // Peshawar
    Peshawar: [
      "Hayatabad",
      "University Town",
      "Cantt",
      "Saddar",
      "Gulbahar",
      "Khyber Bazaar",
      "Chamkani",
      "Pabbi",
      "Warsak Road",
      "Ring Road",
    ],
    // Quetta
    Quetta: [
      "Satellite Town",
      "Jinnah Town",
      "Cantt",
      "Zarghoon Road",
      "Sariab Road",
      "Brewery Road",
      "Airport Road",
      "Spinny Road",
      "Adalat Road",
    ],
    // Multan
    Multan: [
      "Cantt",
      "Shah Rukn-e-Alam",
      "Gulgasht Colony",
      "Bosan Road",
      "Nawan Shehr",
      "Model Town",
      "Qasim Bela",
      "Old Multan",
      "Shujabad Road",
    ],
    // Hyderabad
    Hyderabad: [
      "Latifabad",
      "Qasimabad",
      "Cantt",
      "Saddar",
      "Hirabad",
      "Kotri",
      "Hussainabad",
      "New Hyderabad",
    ],
    // Gujranwala
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