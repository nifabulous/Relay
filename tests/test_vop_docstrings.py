"""Guard tests: VoP docstrings must not teach a false legal standard (item 3.1)."""
import inspect

import app.services.name_matcher as nm
import app.services.vop as vop


def test_name_matcher_does_not_claim_epc_mandates_a_threshold():
    # The offending phrasings must be gone.
    assert "EPC recommends" not in nm.__doc__
    # The corrected framing must be present somewhere in the module docstring.
    assert "commonly tuned" in nm.__doc__
    assert "SequenceMatcher" in nm.__doc__


def test_name_matcher_threshold_comment_is_softened():
    src = inspect.getsource(nm)
    assert "EPC recommends" not in src
    assert "commonly tuned around" in src


def test_vop_docstring_distinguishes_ipr_from_cop():
    doc = vop.__doc__ or ""
    assert "Instant Payments Regulation" in doc
    assert "Confirmation of Payee" in doc  # UK CoP named as distinct
    # Must not assert it *implements* the scheme contract.
    assert "Implements the EPC103-24 VoP scheme contract" not in doc
