/** Shared shapes for Toco's search service, backend REST API, and page data. */

/** A department → category → type → sub-type node in Toco's taxonomy. */
export interface TaxonomyNode {
  id: string;
  slug: string;
  name_id: string;
  name_en: string;
  listing_count?: number | null;
  sort?: number | null;
  classified?: boolean | null;
  categories?: TaxonomyNode[];
  types?: TaxonomyNode[];
  sub_types?: TaxonomyNode[];
}

export interface StoreSummary {
  id?: string;
  toco_name?: string | null;
  toco_short_name?: string | null;
  toco_city?: string | null;
  toco_description?: string | null;
  official_seller?: boolean | null;
  store_tier?: string | null;
  premium_seller?: boolean | null;
  is_online?: boolean | null;
  latest_online?: string | null;
  active_product?: number | null;
  rating?: number | null;
  profile_kyc?: string | null;
}

/**
 * One search hit. The index returns ~108 fields per listing; this covers the
 * ones the tools read. Classified-only fields are present but null on
 * marketplace listings, and vice versa.
 */
export interface Listing {
  id: string;
  slug: string;
  title: string;
  price: number | null;
  price_special: number | null;
  stock: number | null;
  sold: number | null;
  new: boolean | null;
  city: string | null;
  rating: number | null;
  rating_count: number | null;
  review_count: number | null;
  views: number | null;
  likes: number | null;
  wish_count: number | null;
  add_to_cart: boolean | null;
  is_free_ongkir: boolean | null;
  cod: boolean | null;
  is_preorder: boolean | null;
  has_variant: boolean | null;
  min_order: number | null;
  created_at: string | null;
  department: string | null;
  department_name: string | null;
  category: string | null;
  category_name: string | null;
  type: string | null;
  store: StoreSummary | null;
  store_name: string | null;
  store_tier: string | null;
  official_seller: boolean | null;
  photos: string[] | null;
  thumbnails: string[] | null;

  // Classified: vehicles
  production_year: number | null;
  mileage: number | null;
  transmission_type: string | null;
  fuel: string | null;
  color: string | null;
  number_of_seat: number | null;
  license_plate_category: string | null;
  cylinder_capacity: number | null;
  tax_expiry: string | null;

  // Classified: property
  building_area: number | null;
  lot_area: number | null;
  number_of_bedroom: number | null;
  number_of_bathroom: number | null;
  number_of_floor: number | null;
  legal_certificate: string | null;
  facilities: string[] | string | null;
  rental_type: string | null;
  building_name: string | null;
}

export interface ListingSearchResponse {
  results: Listing[];
  total: number;
  query: string | null;
  aggregations: Record<string, { buckets?: Array<{ key: string; doc_count: number }> }> | null;
  search_id: string;
}

export interface SuggestionResponse {
  suggestions: string[];
  query: string;
  search_id: string;
}

export interface StoreSearchResponse {
  results: StoreSummary[];
  /** Capped at 10000 by the index — treat as "at least this many". */
  total: number;
  aggregations: Record<string, { buckets?: Array<{ key: string; doc_count: number }> }> | null;
}

export interface Variant {
  id: string;
  first_variant_type: string | null;
  first_variant_value: string | null;
  second_variant_type: string | null;
  second_variant_value: string | null;
  price: number | null;
  price_special: number | null;
  stock: number | null;
  sku: string | null;
  weight: number | null;
  active: boolean | null;
  default: boolean | null;
  photos: string[] | null;
}

export interface Promo {
  title: string;
  description: string | null;
  minimum_transaction: number | null;
  maximum_discount: number | null;
  discount_amount: number | null;
  discount_percentage: number | null;
  expiry_date: string | null;
  voucher_type: string | null;
}

/** `GET /api/listing/{slug}` on the backend. */
export interface ListingDetail {
  listing: Listing & {
    description: string | null;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    verified: boolean | null;
    collections: string[] | null;
    department: TaxonomyNode | null;
    category: TaxonomyNode | null;
    type: TaxonomyNode | null;
    sub_type: TaxonomyNode | null;
    store: StoreSummary | null;
    promo: Array<{ promo_eligible?: Promo[] }> | null;
    additional_equipment: string[] | string | null;
  };
  variant_types_and_values: {
    first_variant_type: string | null;
    first_variant_values: string[];
    second_variant_type: string | null;
    second_variant_values: string[];
  } | null;
  variants: Variant[] | null;
}

export interface Review {
  rate: number;
  review_text: string | null;
  created_at: string;
  user_display_name: string | null;
}

/** `pageProps` of the server-rendered `/listing/{slug}` page. */
export interface ListingPageProps {
  notFound?: boolean;
  reviews?: Review[];
  summary?: { rating_average?: number; rating_count?: number };
  listingMetaData?: { product_title?: string };
}

/** `pageProps` of the server-rendered `/store/{tocoShortName}` page. */
export interface StorePageProps {
  notFound?: boolean;
  isBanned?: boolean;
  profile?: StoreSummary & Record<string, unknown>;
  storeMetaData?: StoreSummary & Record<string, unknown>;
}
