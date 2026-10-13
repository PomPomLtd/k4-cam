import Header from "./header";
import Socials from "./socials";
import NavButton from "./navButton";
import { SOURCE_URL } from "../../utils/k4/about";

const Home = () => {
  return (
    <div className="container-flex d-flex overflow-hidden h-100 flex-column p-0 m-0 text-center text-white bg-dark">
      <Header />
      <p className="small text-white-50 mx-3 my-1">
        K4 Cam films the boards of Schachklub Kreis 4 for its Lichess broadcasts: a camera starts from a link the
        organiser hands out, and sends the moves to the club&apos;s events app. Everything ChessCam does is still here.{" "}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="link-light">
          Source code
        </a>
      </p>
      <div className="row m-2">
        <div className="col">
          <NavButton text="Upload" tokenRequired={false} />
        </div>
        <div className="col">
          <NavButton text="Record" tokenRequired={false} />
        </div>
      </div>
      <div className="row m-2">
        <div className="col">
          <NavButton text="Broadcast" tokenRequired={true} />
        </div>
        <div className="col">
          <NavButton text="Play" tokenRequired={true} />
        </div>
      </div>
      <div className="row m-2">
        <div className="col">
          <NavButton text="Export" tokenRequired={true} />
        </div>
        <div className="col">
          <NavButton text="FAQ" tokenRequired={false} />
        </div>
      </div>
      <div className="row my-2 mx-0 mt-auto">
        <Socials />
      </div>
    </div>
  );
};

export default Home;
