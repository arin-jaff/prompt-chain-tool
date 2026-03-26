export type Profile = {
  id: string;
  is_superadmin: boolean | null;
  is_matrix_admin: boolean | null;
};

export type HumorFlavor = {
  id: string;
  name: string;
  description: string | null;
  created_datetime_utc?: string;
  modified_datetime_utc?: string;
};

export type HumorFlavorStep = {
  id: string;
  humor_flavor_id: string;
  step_order: number;
  instruction: string;
  created_datetime_utc?: string;
  modified_datetime_utc?: string;
};

export type UserContext = {
  userId: string;
  profile: Profile;
};
