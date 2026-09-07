/**
 * Human approval is intentionally a static snapshot. If a body, recipe,
 * garment source, or fitted output changes, wardrobeBodyProfiles.ts will
 * demote the pairing back to candidate until it is reviewed again.
 */
export const WARDROBE_HUMAN_APPROVAL_BATCH = {
  reviewedBy: "Jamal Taylor",
  reviewedAt: "2026-09-07",
  bodies: {
    elli: { modelUrl: "/companions/elli-wardrobe-identity-preserved-v1.vrm", preparedSha256: "1bc1f48717b2c4b3b97800b92148df1ab30fa83d035516f777098143afdfc03e", recipeVersion: "identity-preserved-v1" },
    matilda: { modelUrl: "/companions/matilda-wardrobe-native-identity-v1.vrm", preparedSha256: "4e26aa5b05cf124dd3adc11f5b72799dedbc88ad15cc5e499060ebab9211dc3a", recipeVersion: "native-identity-v1" },
    princess: { modelUrl: "/companions/princess-wardrobe-native-identity-v1.vrm", preparedSha256: "529dc7d7576009e0da728eb97da9cc86555bd59b420f20aa23e6d9bf83c9ee3a", recipeVersion: "native-identity-v1" },
    yukari: { modelUrl: "/companions/yukari-wardrobe-native-identity-v1.vrm", preparedSha256: "9848767120012b05fc0b835b060ed9b2e1133991244f1a90c2d24363a03c2134", recipeVersion: "native-identity-v1" },
    kefla: { modelUrl: "/companions/kefla-wardrobe-native-identity-v1.vrm", preparedSha256: "a14186271b7e392f11d1a4168c682ff07dade935b56ac26a8efd24779c831733", recipeVersion: "native-identity-v1" },
    melty: { modelUrl: "/companions/melty-wardrobe-native-identity-v1.vrm", preparedSha256: "2783913c2e98e9f83ea4cb2ccf820af81aadf938f522bae45c789df4ad6d034d", recipeVersion: "native-identity-v1" },
    tene: { modelUrl: "/companions/tene-wardrobe-native-identity-v1.vrm", preparedSha256: "768920fd2dc5d73eea234aa65da4f6bb8554144815c7a7cc7b1619d47a2c35c3", recipeVersion: "native-identity-v1" },
    towa: { modelUrl: "/companions/towa-wardrobe-native-identity-v1.vrm", preparedSha256: "5c87339d0750cd7cc0d01c0a4f9ea320a81af7db26680c72bea919fbd620c2d6", recipeVersion: "native-identity-v1" },
  },
  templates: {
    "ribbon-dress": "c716207b017239dcbf2a096e8566d291650f3cb5fd2c6a8089b08f8251d2d0d3:6559a66f693854d63f227742977568324ebb23680a6a6a5ca27b65c47657c213",
    "comet-hoodie": "ea114d56fd5e5803d6a06e07f8e97356b37403379a8b254f62d551ebe5a3e6cf:6559a66f693854d63f227742977568324ebb23680a6a6a5ca27b65c47657c213",
    "constellation-blazer": "3370358848af0e97fdea02d7bc3b2a0cfa5429b8512d20cf5add71c8fa8cca38:6559a66f693854d63f227742977568324ebb23680a6a6a5ca27b65c47657c213",
  },
  fits: {
    elli: {
      "ribbon-dress": { fittedSha256: "502b060b4751b46e9e72c8bfb629f9551f1def71a04258871eddc8901db9054c", evidence: "artifacts/wardrobe-certification/native-identities/elli/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "36770d0240d9349ae8592e4d0811c09023d581db430872a910b5d6103e0b435f", evidence: "artifacts/wardrobe-certification/native-identities/elli/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "897a79aa86f9074dc47ebb16d87b7f550c026125dbbc9c5658511ecac54915cf", evidence: "artifacts/wardrobe-certification/native-identities/elli/constellation-blazer-front-idle.png" },
    },
    matilda: {
      "ribbon-dress": { fittedSha256: "864fa80d2469734549676e66b047850e40c1fd75bd5b6f5d5c37538758fd1843", evidence: "artifacts/wardrobe-certification/native-identities/matilda/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "66034ca61600f2057c2ed2a5012f02305033690cd47af39042b8aa583f879546", evidence: "artifacts/wardrobe-certification/native-identities/matilda/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "757f0fb5bcda33e7f7c60a01558b3f06410cc31e50c162e99f6df9d2e072c3a9", evidence: "artifacts/wardrobe-certification/native-identities/matilda/constellation-blazer-front-idle.png" },
    },
    princess: {
      "ribbon-dress": { fittedSha256: "043d0a02c667db1819cae3f7d8b530fcf2ecbeb2708c0c00cb54a4c60abcbf99", evidence: "artifacts/wardrobe-certification/native-identities/princess/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "1b52b301d70b17b731efcd2d8763cdbccf6493e85733a8046f4c72f1568fd32a", evidence: "artifacts/wardrobe-certification/native-identities/princess/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "fc0ac5d1f911f44fbd30698257edbdfa91554be5a2e5c680d54e475af7f5eefc", evidence: "artifacts/wardrobe-certification/native-identities/princess/constellation-blazer-front-idle.png" },
    },
    yukari: {
      "ribbon-dress": { fittedSha256: "15e84950f81ea427f63e431b1df0a189a16f08abf0b1605a593fbfebd226ab5b", evidence: "artifacts/wardrobe-certification/native-identities/yukari/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "de5d3d1d6aa3042f433895494acbd14f0333d4ccfea532bf7f51690fad105539", evidence: "artifacts/wardrobe-certification/native-identities/yukari/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "a1492b013bae467450b43392ed4d9d6f005dc8b981c4dd5ee0d1f8b10f457aeb", evidence: "artifacts/wardrobe-certification/native-identities/yukari/constellation-blazer-front-idle.png" },
    },
    kefla: {
      "ribbon-dress": { fittedSha256: "1bf47dd09b695445001c5afaa8af2496b0ad62c52817487e1bffda40989e3bd7", evidence: "artifacts/wardrobe-certification/native-identities/kefla/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "ef76fc51808c8e2d582ab404a569b840322d596c6e85c98c4f6f3e2569010dc3", evidence: "artifacts/wardrobe-certification/native-identities/kefla/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "626a42722c5721571ba500a1106322cddd7d7abb2df25fe2dccf6090d0e0517f", evidence: "artifacts/wardrobe-certification/native-identities/kefla/constellation-blazer-front-idle.png" },
    },
    melty: {
      "ribbon-dress": { fittedSha256: "ca777cf8882c7ae84b73201095ff6a9c21e4fb3ea82dd598d0b543a57d1568a4", evidence: "artifacts/wardrobe-certification/native-identities/melty/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "429216be154596ff9f187a917bc00725ce20a33185f4ce755cf656f01793b265", evidence: "artifacts/wardrobe-certification/native-identities/melty/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "fde5481e78ce17e08917235c1bdc96d8a7c2be562810a66bf24c9dd7e3948989", evidence: "artifacts/wardrobe-certification/native-identities/melty/constellation-blazer-front-idle.png" },
    },
    tene: {
      "ribbon-dress": { fittedSha256: "1d6899003529508ab6d5cc23ddee27f5a924a7d83b0041380757a5e7d613bebb", evidence: "artifacts/wardrobe-certification/native-identities/tene/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "d871fd15ae02c94aadbf50f4e3429d20515883d36ef4c71f6c5e60d074cde583", evidence: "artifacts/wardrobe-certification/native-identities/tene/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "cc2d16f4d451acc53c8ba2b33e346ac48e04d81eed61f1ece353a4e736028b61", evidence: "artifacts/wardrobe-certification/native-identities/tene/constellation-blazer-front-idle.png" },
    },
    towa: {
      "ribbon-dress": { fittedSha256: "d473d38cad294acdc545ae6b305a3a32f7e50368c9fff7a217d9b75b3da8fb80", evidence: "artifacts/wardrobe-certification/native-identities/towa/navy-ribbon-dress-front-idle.png" },
      "comet-hoodie": { fittedSha256: "9564e9aaea072ba87f0ecab371e33e5eda00999163b8df1124dc65682e634137", evidence: "artifacts/wardrobe-certification/native-identities/towa/comet-hoodie-front-idle.png" },
      "constellation-blazer": { fittedSha256: "6275009b2a83d1e650ee11829948fe74a62fb0cb50737b718708d8e279ee7a6f", evidence: "artifacts/wardrobe-certification/native-identities/towa/constellation-blazer-front-idle.png" },
    },
  },
} as const;
