from financial_registry.normalize import normalize_domain, normalize_identifier, normalize_name


def test_name_normalization_collapses_case_spacing_and_punctuation():
    assert normalize_name("  Banco  Example, S.A. ") == "banco example sa"


def test_domain_normalization_removes_scheme_and_default_path():
    assert normalize_domain("https://WWW.Example.com/") == "example.com"


def test_identifier_normalization_removes_bic_spacing():
    assert normalize_identifier("bic", " abcd gb 2l ") == "ABC DGB2L".replace(" ", "")


def test_normalization_is_idempotent_and_domains_are_idna_safe():
    value = normalize_name(" Banco Example, S.A. ")
    assert normalize_name(value) == value
    assert normalize_domain("https://例え.テスト/") == "xn--r8jz45g.xn--zckzah"
