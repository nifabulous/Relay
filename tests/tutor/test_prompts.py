from app.tutor.prompts import build_prompt_payload
from app.tutor.schemas import TutorRequest


def test_prompt_includes_resource_reference_for_selection_aware_context():
    request = TutorRequest(
        message="What does this country show?",
        context={
            "surface": "atlas",
            "resource_ref": "atlas:spoke:settleable:country:CA",
        },
    )

    payload = build_prompt_payload(request, [])

    assert "resource: atlas:spoke:settleable:country:CA" in payload.user
