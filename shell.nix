with import <nixpkgs> {};

stdenv.mkDerivation {
  name = "crdt-sqlite-dev-env";

  buildInputs = with pkgs; [
    litestream
  ];
}
