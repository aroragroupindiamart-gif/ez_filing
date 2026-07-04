"""Stub for emergentintegrations.llm.chat — real package not available on PyPI.

llm_extract.py guards all calls behind `EMERGENT_LLM_KEY` presence check and
wraps them in try/except, so this stub is only reached if the key is set.
Raising NotImplementedError surfaces a clear message instead of a silent failure.
"""


class UserMessage:
    def __init__(self, text: str = "", **kwargs):
        self.text = text


class LlmChat:
    def __init__(self, api_key: str = "", session_id: str = "", system_message: str = "", **kwargs):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message

    def with_model(self, provider: str, model: str) -> "LlmChat":
        return self

    async def send_message(self, message: UserMessage) -> str:
        raise NotImplementedError(
            "emergentintegrations is not installed. "
            "Remove EMERGENT_LLM_KEY to use heuristic extraction instead."
        )
