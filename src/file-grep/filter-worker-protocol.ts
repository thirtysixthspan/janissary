export type GrepFilterRequest = {
  paths: string[];
  include: string;
  exclude: string;
};

export type GrepFilterResponse = {
  paths: string[];
};
