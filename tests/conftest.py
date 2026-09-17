"""Windows compatibility and test instrumentation for GenLayer Test Direct Mode."""

from __future__ import annotations

import json
import io
import os
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import pytest
from gltest.direct.vm import MockedWebResponseData, VMContext
from gltest.direct import sdk_loader, wasi_mock
from gltest.direct.sdk_loader import setup_sdk_paths

CONTRACT_PATH = Path(__file__).parents[1] / "contracts" / "veridex.py"
os.environ.setdefault("GENVM_VERSION", "v0.6.0-rc5")
setup_sdk_paths(CONTRACT_PATH, version=os.environ["GENVM_VERSION"])

# The RC Direct Mode loader adds the SDK but not the runner's cloudpickle
# dependency. Load it from the same pinned official GenVM bundle.
_bundle = sdk_loader.download_artifacts(os.environ["GENVM_VERSION"])
_runner = sdk_loader.extract_runner(
    _bundle,
    sdk_loader.RUNNER_TYPE,
    sdk_loader.parse_contract_header(CONTRACT_PATH)[sdk_loader.RUNNER_TYPE],
    os.environ["GENVM_VERSION"],
)
_cloudpickle_hash = sdk_loader.parse_runner_manifest(_runner)["py-lib-cloudpickle"]
try:
    _cloudpickle = sdk_loader.extract_runner(
        _bundle, "py-lib-cloudpickle", _cloudpickle_hash, os.environ["GENVM_VERSION"]
    )
except ValueError as error:
    # RC5 now packages this dependency as .zip while gltest still expects .tar.
    if "No py-lib-cloudpickle runners found" not in str(error):
        raise
    _cloudpickle = (
        sdk_loader.CACHE_DIR
        / "extracted"
        / os.environ["GENVM_VERSION"]
        / "py-lib-cloudpickle"
        / _cloudpickle_hash
    )
    if not _cloudpickle.exists():
        member = (
            f"runners/py-lib-cloudpickle/{_cloudpickle_hash[:2]}/"
            f"{_cloudpickle_hash[2:]}.zip"
        )
        with tarfile.open(_bundle, "r:xz") as archive:
            payload = archive.extractfile(member)
            if payload is None:
                raise ValueError(f"Runner hash {_cloudpickle_hash} not found")
            with zipfile.ZipFile(io.BytesIO(payload.read())) as dependency:
                if any(Path(name).is_absolute() or ".." in Path(name).parts for name in dependency.namelist()):
                    raise ValueError("Unsafe cloudpickle dependency archive")
                _cloudpickle.mkdir(parents=True)
                dependency.extractall(_cloudpickle)
_cloudpickle_src = _cloudpickle / "src"
_cloudpickle_path = str(_cloudpickle_src if _cloudpickle_src.exists() else _cloudpickle)
sys.path.insert(0, _cloudpickle_path)
import cloudpickle  # noqa: F401  # Required by Direct Mode closure checks.


def _llm_text_response(vm, data):
    response = vm._match_llm_mock(data.get("prompt", ""))
    if response is None:
        raise wasi_mock.MockNotFoundError("No LLM mock matched the prompt")
    return {"ok": response}


wasi_mock._handle_llm_request = _llm_text_response

def _instrument_vm_and_web() -> None:
    from gltest.direct import wasi_mock

    original_handle_web_request = wasi_mock._handle_web_request
    original_handle_web_render = wasi_mock._handle_web_render

    def _recording_handle_web_request(vm_ctx: Any, data: Any) -> Any:
        if not hasattr(vm_ctx, "_recorded_web_renders"):
            vm_ctx._recorded_web_renders = []
        if not hasattr(vm_ctx, "_recorded_web_requests"):
            vm_ctx._recorded_web_requests = []
        vm_ctx._recorded_web_renders.append(dict(data))
        vm_ctx._recorded_web_requests.append(dict(data))
        return original_handle_web_request(vm_ctx, data)

    def _recording_handle_web_render(vm_ctx: Any, data: Any) -> Any:
        if not hasattr(vm_ctx, "_recorded_web_renders"):
            vm_ctx._recorded_web_renders = []
        vm_ctx._recorded_web_renders.append(dict(data))
        return original_handle_web_render(vm_ctx, data)

    wasi_mock._handle_web_request = _recording_handle_web_request
    wasi_mock._handle_web_render = _recording_handle_web_render

def pytest_configure() -> None:
    from gltest.direct import loader

    original_refresh_message = VMContext._refresh_gl_message

    def refresh_current_message(vm):
        original_refresh_message(vm)
        message = sys.modules.get("genlayer.message")
        if message is None:
            return
        from genlayer.types import Address, u256

        def address(value):
            return value if isinstance(value, Address) else Address(value)

        values = {
            "contract_address": address(vm._contract_address),
            "sender_address": address(vm.sender),
            "origin_address": address(vm.origin),
            "signer_address": address(vm.origin),
            "value": u256(vm._value),
            "chain_id": u256(vm._chain_id),
        }
        for name, value in values.items():
            setattr(message, name, value)
        if isinstance(getattr(message, "raw", None), dict):
            message.raw.update(values)

    VMContext._refresh_gl_message = refresh_current_message

    # RC5 omits its pinned cloudpickle path inside the Direct Mode sandbox.
    # Restore that exact runner dependency, then use the official checker.
    original_validate_pickling = loader._validate_pickling

    def validate_pickling_with_pinned_bundle(fn, label):
        if _cloudpickle_path not in sys.path:
            sys.path.insert(0, _cloudpickle_path)
        original_validate_pickling(fn, label)

    loader._validate_pickling = validate_pickling_with_pinned_bundle

    if sys.platform == "win32":
        def inject_message_windows_compat(vm):
            from genlayer import calldata
            from genlayer.types import Address

            def address(value):
                return value if isinstance(value, Address) else Address(value)

            encoded = calldata.encode({
                "contract_address": address(vm._contract_address),
                "sender_address": address(vm.sender),
                "origin_address": address(vm.origin),
                "signer_address": address(vm.origin),
                "stack": [],
                "value": vm._value,
                "datetime": vm._datetime,
                "is_init": False,
                "chain_id": vm._chain_id,
                "entry_kind": 0,
                "entry_data": b"",
                "entry_stage_data": None,
            })
            fd, path = tempfile.mkstemp()
            try:
                os.write(fd, encoded)
                os.lseek(fd, 0, os.SEEK_SET)
                vm._original_stdin_fd = os.dup(0)
                os.dup2(fd, 0)
            finally:
                os.close(fd)
                try:
                    os.unlink(path)
                except OSError:
                    pass

        loader._inject_message_to_fd0 = inject_message_windows_compat

        original_load_contract_class = loader.load_contract_class

        def load_contract_class_with_message_refresh(contract_path, vm, sdk_version=None):
            contract_class = original_load_contract_class(contract_path, vm, sdk_version)
            vm._refresh_gl_message()
            return contract_class

        loader.load_contract_class = load_contract_class_with_message_refresh

    _instrument_vm_and_web()


class MockWebHelper:
    def __init__(self, vm: VMContext):
        self.vm = vm

    def clear(self):
        self.vm.clear_mocks()

    def get(self, url_pattern: str, status: int = 200, body: str = ""):
        self.vm.mock_web(url_pattern, MockedWebResponseData(method="GET", status=status, body=body))

    def get_json(self, url_pattern: str, status: int = 200, data: dict | list | None = None):
        body_str = json.dumps(data) if data is not None else ""
        self.vm.mock_web(url_pattern, MockedWebResponseData(method="GET", status=status, body=body_str))


class MockLlmHelper:
    def __init__(self, vm: VMContext):
        self.vm = vm

    def clear(self):
        self.vm.clear_mocks()

    def prompt(self, prompt_pattern: str, response: str | dict):
        if isinstance(response, dict):
            resp_str = json.dumps(response)
        else:
            resp_str = str(response)
        self.vm.mock_llm(prompt_pattern, resp_str)


@pytest.fixture(autouse=True)
def enforce_direct_mode_safety(direct_vm):
    direct_vm.check_pickling = True
    direct_vm.strict_mocks = True
    yield


@pytest.fixture
def mock_web(direct_vm):
    return MockWebHelper(direct_vm)


@pytest.fixture
def mock_llm(direct_vm):
    return MockLlmHelper(direct_vm)
