// Same list as the public site.
export const COUNTRIES: { code: string; name: string }[] = [
  ["NG", "Nigeria"], ["GB", "United Kingdom"], ["US", "United States"], ["CA", "Canada"], ["GH", "Ghana"],
  ["ZA", "South Africa"], ["KE", "Kenya"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"],
  ["IT", "Italy"], ["ES", "Spain"], ["NL", "Netherlands"], ["BE", "Belgium"], ["SE", "Sweden"],
  ["NO", "Norway"], ["DK", "Denmark"], ["FI", "Finland"], ["CH", "Switzerland"], ["AT", "Austria"],
  ["PT", "Portugal"], ["PL", "Poland"], ["AU", "Australia"], ["NZ", "New Zealand"], ["AE", "United Arab Emirates"],
  ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["IN", "India"], ["CN", "China"], ["JP", "Japan"],
  ["SG", "Singapore"], ["MY", "Malaysia"], ["BR", "Brazil"], ["MX", "Mexico"], ["EG", "Egypt"],
  ["CM", "Cameroon"], ["BJ", "Benin"], ["TG", "Togo"], ["SN", "Senegal"], ["CI", "Côte d'Ivoire"],
  ["UG", "Uganda"], ["TZ", "Tanzania"], ["RW", "Rwanda"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"],
  ["XX", "Other"],
].map(([code, name]) => ({ code, name }));

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
export const isCountry = (code: string) => COUNTRIES.some((c) => c.code === code);
